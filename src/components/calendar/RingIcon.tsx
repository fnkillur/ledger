// 아이콘 묶음(phosphor)에 반지가 없어서, 같은 굵기·채움 느낌으로 직접 그린다.
function RingIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <circle cx="128" cy="164" r="66" fill="none" stroke="currentColor" strokeWidth="24" />
      <path d="M92 40h72l24 28-60 56-60-56z" />
    </svg>
  )
}

export default RingIcon
