import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface AuthResult {
  userId: string
  supabase: SupabaseClient
}

interface AuthError {
  error: { code: string; message: string; status: number }
}

/**
 * Authenticate request via X-API-Key or Authorization: Bearer JWT
 * Returns userId and a service-role supabase client
 */
export async function authenticateRequest(
  req: Request
): Promise<AuthResult | AuthError> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Method 1: API Key authentication
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) {
    // Hash the key with SHA-256
    const encoder = new TextEncoder()
    const data = encoder.encode(apiKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

    const { data: keyRecord, error } = await supabase
      .from('api_keys')
      .select('user_id, is_active, expires_at, permissions')
      .eq('key_hash', keyHash)
      .single()

    if (error || !keyRecord) {
      return {
        error: { code: 'INVALID_API_KEY', message: 'Invalid API key', status: 401 },
      }
    }

    if (!keyRecord.is_active) {
      return {
        error: { code: 'API_KEY_DISABLED', message: 'API key is disabled', status: 401 },
      }
    }

    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      return {
        error: { code: 'API_KEY_EXPIRED', message: 'API key has expired', status: 401 },
      }
    }

    // Update last_used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('key_hash', keyHash)

    return { userId: keyRecord.user_id, supabase }
  }

  // Method 2: JWT Bearer token authentication
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '')

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return {
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired JWT token', status: 401 },
      }
    }

    return { userId: user.id, supabase }
  }

  return {
    error: { code: 'NO_AUTH', message: 'Missing authentication. Provide X-API-Key or Authorization: Bearer header', status: 401 },
  }
}

/**
 * Check if user is a member of the given project
 */
export async function checkProjectAccess(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  requiredRole?: 'owner' | 'editor' | 'viewer'
): Promise<{ allowed: boolean; role?: string }> {
  const { data, error } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return { allowed: false }
  }

  if (!requiredRole) {
    return { allowed: true, role: data.role }
  }

  const roleHierarchy: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }
  const userLevel = roleHierarchy[data.role] ?? 0
  const requiredLevel = roleHierarchy[requiredRole] ?? 0

  return { allowed: userLevel >= requiredLevel, role: data.role }
}
