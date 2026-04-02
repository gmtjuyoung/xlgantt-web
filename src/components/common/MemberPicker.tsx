import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Building2, User, Check, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useResourceStore } from '@/stores/resource-store'
import { cn } from '@/lib/utils'

interface MemberPickerProps {
  /** 선택된 member ID(들) */
  value: string | string[]
  /** 선택 변경 콜백 */
  onChange: (memberIds: string[]) => void
  /** 단일 선택 모드 (기본: false = 다중 선택) */
  single?: boolean
  /** 트리거 버튼 텍스트 */
  placeholder?: string
  /** 트리거 크기 */
  size?: 'sm' | 'default'
  /** 비활성화 */
  disabled?: boolean
}

export function MemberPicker({
  value,
  onChange,
  single = false,
  placeholder = '담당자 선택...',
  size = 'default',
  disabled = false,
}: MemberPickerProps) {
  const { companies, members } = useResourceStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set(companies.map(c => c.id)))

  const selectedIds = useMemo(() => {
    if (Array.isArray(value)) return new Set(value)
    return value ? new Set([value]) : new Set<string>()
  }, [value])

  const filteredTree = useMemo(() => {
    const q = search.toLowerCase()
    return companies.map((company) => {
      const compMembers = members.filter((m) => m.company_id === company.id)
      const filtered = q
        ? compMembers.filter((m) => m.name.toLowerCase().includes(q) || m.role?.toLowerCase().includes(q) || company.name.toLowerCase().includes(q))
        : compMembers
      return { company, members: filtered }
    }).filter((g) => g.members.length > 0)
  }, [companies, members, search])

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev)
      next.has(companyId) ? next.delete(companyId) : next.add(companyId)
      return next
    })
  }

  const toggleMember = (memberId: string) => {
    if (single) {
      onChange([memberId])
      setOpen(false)
    } else {
      const next = new Set(selectedIds)
      next.has(memberId) ? next.delete(memberId) : next.add(memberId)
      onChange([...next])
    }
  }

  const selectAllInCompany = (companyMembers: typeof members) => {
    const ids = companyMembers.map((m) => m.id)
    const allSelected = ids.every((id) => selectedIds.has(id))
    const next = new Set(selectedIds)
    if (allSelected) {
      ids.forEach((id) => next.delete(id))
    } else {
      ids.forEach((id) => next.add(id))
    }
    onChange([...next])
  }

  // 선택된 멤버 이름 표시
  const displayText = useMemo(() => {
    if (selectedIds.size === 0) return placeholder
    const names = [...selectedIds].map((id) => members.find((m) => m.id === id)?.name).filter(Boolean)
    if (names.length <= 2) return names.join(', ')
    return `${names[0]} 외 ${names.length - 1}명`
  }, [selectedIds, members, placeholder])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between font-normal",
            size === 'sm' ? 'h-8 text-xs px-2' : 'h-9 text-sm px-3',
            selectedIds.size === 0 && 'text-muted-foreground'
          )}
        >
          <span className="truncate">{displayText}</span>
          {selectedIds.size > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{selectedIds.size}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {/* 검색 */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="이름 또는 역할 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>

        {/* 트리 목록 */}
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filteredTree.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">검색 결과 없음</div>
          )}
          {filteredTree.map(({ company, members: compMembers }) => {
            const isExpanded = expandedCompanies.has(company.id)
            const allSelected = compMembers.every((m) => selectedIds.has(m.id))
            const someSelected = compMembers.some((m) => selectedIds.has(m.id))
            return (
              <div key={company.id}>
                {/* 회사 헤더 */}
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer select-none"
                  onClick={() => toggleCompany(company.id)}
                >
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <div className="w-4 h-4 rounded flex items-center justify-center" style={{ backgroundColor: company.color || '#888' }}>
                    <Building2 className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span className="text-sm font-medium flex-1">{company.name}</span>
                  {!single && (
                    <button
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                        allSelected ? 'bg-primary border-primary' : someSelected ? 'bg-primary/30 border-primary' : 'border-border'
                      )}
                      onClick={(e) => { e.stopPropagation(); selectAllInCompany(compMembers) }}
                    >
                      {allSelected && <Check className="h-3 w-3 text-white" />}
                      {someSelected && !allSelected && <div className="w-2 h-0.5 bg-white rounded" />}
                    </button>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{compMembers.length}</Badge>
                </div>
                {/* 멤버 목록 */}
                {isExpanded && compMembers.map((member) => {
                  const isSelected = selectedIds.has(member.id)
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-2 pl-8 pr-2 py-1.5 rounded cursor-pointer transition-colors",
                        isSelected ? 'bg-primary/10' : 'hover:bg-accent/30'
                      )}
                      onClick={() => toggleMember(member.id)}
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ backgroundColor: company.color || '#888' }}
                      >
                        {member.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{member.name}</span>
                        {member.role && <span className="text-xs text-muted-foreground ml-1.5">{member.role}</span>}
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* 하단 */}
        {!single && selectedIds.size > 0 && (
          <div className="border-t p-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{selectedIds.size}명 선택됨</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onChange([])}>전체 해제</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
