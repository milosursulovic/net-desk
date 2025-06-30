export const getFieldIcon = (name) => {
  const icons = {
    ip: '🌐',
    computerName: '🖥️',
    username: '👤',
    fullName: '🙍‍♂️',
    password: '🔒',
    rdp: '🖧',
  }
  return icons[name] || '📄'
}
