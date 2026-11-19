import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Segmented from '../../components/Segmented'
import useSheetDrag from '../../components/useSheetDrag'
import {
  GROCERY_SORTS,
  groceryItemRanking,
  priceChange,
  priceHistory,
  quantityLabel,
  type GroceryItem,
  type GroceryPurchase,
  type GrocerySort,
} from '../../domain/groceryItems'
import { useBackHandler } from '../../navigation/back'
import { formatWon } from '../../utils/format'

const COLLAPSED_COUNT = 10

type GroceryItemsCardProps = {
  purchases: GroceryPurchase[]
  allPurchases: GroceryPurchase[]
}

const formatHistoryDate = (iso: string) => {
  const date = new Date(iso)
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
}

const priceChangeLabel = (change: { difference: number; percent: number }) => {
  if (change.difference > 0) return `지난번보다 ${formatWon(change.difference)} 올랐어요 (+${change.percent}%)`
  if (change.difference < 0) return `지난번보다 ${formatWon(-change.difference)} 내렸어요 (${change.percent}%)`
  return '지난번과 같은 가격이에요'
}

// 영수증으로 기록한 식재료 품목을 모아, 이 기간에 무엇을 자주 샀는지와 품목별 가격 변화를 본다.
function GroceryItemsCard({ purchases, allPurchases }: GroceryItemsCardProps) {
  const [sort, setSort] = useState<GrocerySort>('횟수순')
  const [isExpanded, setIsExpanded] = useState(false)
  const [openedItem, setOpenedItem] = useState<GroceryItem | null>(null)

  if (allPurchases.length === 0) return null

  const ranking = groceryItemRanking(purchases, sort)
  const visible = isExpanded ? ranking : ranking.slice(0, COLLAPSED_COUNT)

  return (
    <section className="card">
      <h2 className="card-title">식재료 품목</h2>
      {ranking.length === 0 ? (
        <p className="card-description">이 기간에는 영수증으로 기록한 식재료가 없어요.</p>
      ) : (
        <>
          <Segmented label="품목 정렬" options={GROCERY_SORTS} value={sort} onChange={setSort} />
          <ul className="grocery-items">
            {visible.map(item => (
              <li key={item.key}>
                <button type="button" className="grocery-item" onClick={() => setOpenedItem(item)}>
                  <strong>{item.name}</strong>
                  <span className="grocery-item-count">{item.count}회</span>
                  <span className="grocery-item-amount">{formatWon(item.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
          {ranking.length > COLLAPSED_COUNT && (
            <button type="button" className="text-button grocery-more" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? '접기' : `${ranking.length - COLLAPSED_COUNT}개 더 보기`}
            </button>
          )}
        </>
      )}
      {openedItem &&
        createPortal(
          <GroceryPriceSheet item={openedItem} history={priceHistory(allPurchases, openedItem.key)} onClose={() => setOpenedItem(null)} />,
          document.body,
        )}
    </section>
  )
}

type GroceryPriceSheetProps = {
  item: GroceryItem
  history: GroceryPurchase[]
  onClose: () => void
}

function GroceryPriceSheet({ item, history, onClose }: GroceryPriceSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { close, isClosing, handleProps } = useSheetDrag({ sheetRef, scrollRef, onClose })

  useBackHandler(close)

  const change = priceChange(history)

  return (
    <div className={`sheet-backdrop day-sheet-backdrop${isClosing ? ' is-closing' : ''}`} onClick={close}>
      <div ref={sheetRef} className="day-sheet category-detail" role="dialog" aria-label={`${item.name} 가격`} onClick={event => event.stopPropagation()}>
        <div className="day-sheet-handle category-detail-header" {...handleProps}>
          <span className="day-sheet-grabber" aria-hidden="true" />
          <h2>{item.name}</h2>
          <p className="category-detail-summary">
            <span>지금까지 {history.length}번 샀어요</span>
          </p>
          {change && <p className="grocery-price-change">{priceChangeLabel(change)}</p>}
        </div>
        <div ref={scrollRef} className="day-sheet-scroll">
          <ul className="grocery-history">
            {history.map((purchase, index) => (
              <li key={`${purchase.transactionId}-${index}`}>
                <span className="grocery-history-date">{formatHistoryDate(purchase.occurredAt)}</span>
                <span className="grocery-history-merchant">
                  {purchase.merchant}
                  {purchase.quantity > 1 && <small>{quantityLabel(purchase.quantity, purchase.unitPrice)}</small>}
                </span>
                <strong>{formatWon(purchase.amount)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default GroceryItemsCard
