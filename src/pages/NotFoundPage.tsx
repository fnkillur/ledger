import { Link } from 'react-router'
import EmptyState from '../components/EmptyState'
import TopBar from '../components/TopBar'

function NotFoundPage() {
  return (
    <div className="page">
      <TopBar showBack />
      <main className="page-content">
        <EmptyState sticker="puzzled">
          <span>내역을 찾을 수 없어요.</span>
          <Link to="/" replace>
            목록으로
          </Link>
        </EmptyState>
      </main>
    </div>
  )
}

export default NotFoundPage
