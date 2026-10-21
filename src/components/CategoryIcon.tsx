type CategoryIconProps = {
  icon: string | undefined
  size?: number
}

function CategoryIcon({ icon, size = 18 }: CategoryIconProps) {
  return (
    <span className="category-icon" style={{ width: size + 10, height: size + 10, fontSize: size }} aria-hidden="true">
      {icon || '•'}
    </span>
  )
}

export default CategoryIcon
