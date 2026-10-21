import { Link } from 'react-router'
import TopBar from '../components/TopBar'

function NotFoundPage() {
  return (
    <div className="page">
      <TopBar showBack />
      <main className="page-content empty-state">
        <p>내역을 찾을 수 없어요.</p>
        <Link to="/" replace>
          목록으로
        </Link>
      </main>
    </div>
  )
}

export default NotFoundPage
