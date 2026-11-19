import { useRef } from 'react'
import { Link } from 'react-router'
import { quantityLabel } from '../domain/groceryItems'
import { quantityOf, unitPriceOf, type ReceiptLine, type Transaction } from '../domain/types'
import { useBackHandler } from '../navigation/back'
import { formatDayTitle, formatWon, toDateKey } from '../utils/format'
import useSheetDrag from './useSheetDrag'

type ReceiptSheetProps = {
  transaction: Transaction & { receiptItems: ReceiptLine[] }
  onClose: () => void
}

// 영수증 품목이 있는 내역은 고칠 일이 드물어서, 누르면 품목부터 보여 주고 고칠 때만 수정 화면으로 간다.
function ReceiptSheet({ transaction, onClose }: ReceiptSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { close, isClosing, handleProps } = useSheetDrag({ sheetRef, scrollRef, onClose })

  useBackHandler(close)

  const title = transaction.merchant || transaction.category

  return (
    <div className={`sheet-backdrop day-sheet-backdrop${isClosing ? ' is-closing' : ''}`} onClick={close}>
      <div ref={sheetRef} className="day-sheet category-detail" role="dialog" aria-label={`${title} 영수증`} onClick={event => event.stopPropagation()}>
        <div className="day-sheet-handle category-detail-header" {...handleProps}>
          <span className="day-sheet-grabber" aria-hidden="true" />
          <h2>{formatDayTitle(toDateKey(transaction.occurredAt))}</h2>
          <p className="receipt-sheet-meta">
            {title} · {formatWon(transaction.amount)}
          </p>
        </div>
        <div ref={scrollRef} className="day-sheet-scroll receipt-sheet-body">
          <ul className="day-sheet-list receipt-cards">
            {transaction.receiptItems.map((item, index) => (
              <ReceiptCard key={index} item={item} />
            ))}
          </ul>
        </div>
        <div className="day-sheet-footer">
          <Link to={`/tx/${transaction.id}`} className="button receipt-sheet-edit">
            수정
          </Link>
        </div>
      </div>
    </div>
  )
}

// 그날 산 품목에서 보고 싶은 건 1개 가격과 개수라서 그 둘을 크게, 줄 합계는 작게 둔다.
function ReceiptCard({ item }: { item: ReceiptLine }) {
  const quantity = quantityOf(item)

  return (
    <li className="receipt-card">
      <strong className="receipt-card-name">{item.name}</strong>
      <strong className="receipt-card-price">{formatWon(unitPriceOf(item))}</strong>
      <span className="receipt-card-detail">{quantity > 1 ? `${quantity}개 · 합계 ${formatWon(item.amount)}` : '1개'}</span>
    </li>
  )
}

export function ReceiptLineList({ items }: { items: ReceiptLine[] }) {
  return (
    <ul className="receipt-lines">
      {items.map((item, index) => (
        <li key={index}>
          <span>
            {item.name}
            {quantityOf(item) > 1 && <small>{quantityLabel(quantityOf(item), unitPriceOf(item))}</small>}
          </span>
          <span>{formatWon(item.amount)}</span>
        </li>
      ))}
    </ul>
  )
}

export default ReceiptSheet
