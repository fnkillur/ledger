import { useLayoutEffect, useRef, useState } from 'react'
import CategoryIcon from '../../components/CategoryIcon'
import Segmented from '../../components/Segmented'
import TransactionRow from '../../components/TransactionRow'
import useSheetDrag from '../../components/useSheetDrag'
import { useCategoryIcons } from '../../db/hooks'
import { CATEGORY_SORTS, categoryDetail, merchantGroups, sortCategoryItems, type CategorySort } from '../../domain/categoryDetail'
import type { Transaction } from '../../domain/types'
import { useBackHandler } from '../../navigation/back'
import { formatWon } from '../../utils/format'

type CategoryDetailSheetProps = {
  category: string
  transactions: Transaction[]
  excludedCategories: Set<string>
  onClose: () => void
}

// 통계에서 카테고리를 누르면 그 기간에 그 카테고리로 쓴 내역을 보여 준다. 내역을 누르면 고치는 화면으로 간다.
function CategoryDetailSheet({ category, transactions, excludedCategories, onClose }: CategoryDetailSheetProps) {
  const icons = useCategoryIcons()
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { close, isClosing, handleProps } = useSheetDrag({ sheetRef, scrollRef, onClose })

  const [sort, setSort] = useState<CategorySort>('금액순')

  useBackHandler(close)

  // 정렬마다 줄 수가 달라(횟수순은 가맹점별로 묶여 짧다) 시트가 들썩이지 않게, 처음 열린 높이로 고정한다.
  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (sheet) sheet.style.height = `${sheet.offsetHeight}px`
  }, [])

  const detail = categoryDetail(transactions, category, excludedCategories)

  return (
    <div className={`sheet-backdrop day-sheet-backdrop${isClosing ? ' is-closing' : ''}`} onClick={close}>
      <div ref={sheetRef} className="day-sheet category-detail" role="dialog" aria-label={`${category} 내역`} onClick={event => event.stopPropagation()}>
        {/* 요약과 정렬은 손잡이 영역에 둬서 목록을 내려도 보이고, 여기를 잡아도 시트를 내릴 수 있다. */}
        <div className="day-sheet-handle category-detail-header" {...handleProps}>
          <span className="day-sheet-grabber" aria-hidden="true" />
          <h2>
            <CategoryIcon name={category} emoji={icons.get(category)} size={20} />
            {category}
          </h2>
          <p className="category-detail-summary">
            <strong>{formatWon(detail.total)}</strong>
            <span>
              {detail.count}건 · 평균 {formatWon(detail.average)}
            </span>
          </p>
          <div data-sheet-nodrag>
            <Segmented label="정렬" options={CATEGORY_SORTS} value={sort} onChange={setSort} />
          </div>
        </div>
        <div ref={scrollRef} className="day-sheet-scroll">
          {sort === '횟수순' ? (
            <ul className="tx-list">
              {merchantGroups(detail.items).map(group => (
                <li key={group.merchant} className="merchant-group">
                  <strong>{group.merchant}</strong>
                  <span className="merchant-group-count">{group.count}회</span>
                  <span className="merchant-group-amount">{formatWon(group.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="tx-list">
              {sortCategoryItems(detail.items, sort).map(transaction => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default CategoryDetailSheet
