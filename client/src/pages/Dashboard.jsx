import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const inputStyle = { background: '#17171A', border: '1px solid #26262A', borderRadius: '6px', padding: '0.5rem', color: '#F5F5F3', fontFamily: 'monospace' }
const buttonStyle = { background: '#FF6B45', color: '#0B0B0D', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontFamily: 'monospace', fontWeight: 'bold', cursor: 'pointer' }
const cellStyle = { padding: '0.5rem 0', borderBottom: '1px solid #1E1E22', textAlign: 'left' }

export default function Dashboard() {
  const [me, setMe] = useState(null)
  const [team, setTeam] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteMsg, setInviteMsg] = useState(null)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const meRes = await api.get('/api/me')
      setMe(meRes.data)
      const teamRes = await api.get('/api/team')
      setTeam(teamRes.data)
    } catch {
      navigate('/login')
    }
  }

  useEffect(() => { load() }, [])

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviteMsg(null)
    try {
      const res = await api.post('/api/team/invite', { email: inviteEmail, role: inviteRole })
      setInviteMsg({ ok: res.data.emailSent !== false, text: res.data.message })
      setInviteEmail('')
    } catch (err) {
      setInviteMsg({ ok: false, text: err.response?.data?.error || 'Could not send invite.' })
    }
  }

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken')
    await api.post('/api/auth/logout', { refreshToken }).catch(() => {})
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    navigate('/login')
  }

  if (!me) return null

  // /api/me returns { user, company } - user fields live under me.user
  const user = me.user || {}
  const company = me.company || {}
  const canInvite = user.role === 'owner' || user.role === 'admin'

  return (
    <div style={{ background: '#0B0B0D', minHeight: '100vh', color: '#F5F5F3', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: '#FF6B45' }}>{company.name}</h1>
        <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #26262A', borderRadius: '6px', padding: '0.4rem 0.8rem', color: '#A6A6AC', cursor: 'pointer' }}>
          Log out
        </button>
      </div>
      <p style={{ color: '#A6A6AC' }}>
        Logged in as {user.name} ({user.role})
      </p>

      <h2 style={{ color: '#7C6FF0', marginTop: '2rem', fontSize: '1rem' }}>Team</h2>
      <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Name</th>
            <th style={cellStyle}>Email</th>
            <th style={cellStyle}>Role</th>
          </tr>
        </thead>
        <tbody>
          {team.map((member) => (
            <tr key={member._id}>
              <td style={cellStyle}>{member.name}</td>
              <td style={{ ...cellStyle, color: '#A6A6AC' }}>{member.email}</td>
              <td style={{ ...cellStyle, color: '#4AD3C9' }}>{member.role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {canInvite && (
        <form onSubmit={handleInvite} style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@email.com"
            style={inputStyle}
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={inputStyle}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" style={buttonStyle}>Invite</button>
        </form>
      )}
      {inviteMsg && (
        <p style={{ color: inviteMsg.ok ? '#4AD3C9' : '#FF6B45', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          {inviteMsg.text}
        </p>
      )}
    </div>
  )
}