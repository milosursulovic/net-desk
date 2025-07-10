export const getFieldIcon = (name) => {
  const icons = {
    ip: '🌐',
    computerName: '🖥️',
    username: '👤',
    fullName: '🙍‍♂️',
    password: '🔒',
    rdp: '🖧',
    dnsLog: '🌐',
    anyDesk: '💻',
    system: '🧩',
  }
  return icons[name] || '📄'
}
