import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'

const inputStyle = {
  background: '#17171A',
  border: '1px solid #26262A',
  borderRadius: '6px',
  padding: '0.5rem',
  color: '#F5F5F3',
  fontFamily: 'monospace',
}

const buttonStyle = {
  background: '#FF6B45',
  color: '#0B0B0D',
  border: 'none',
  borderRadius: '6px',
  padding: '0.5rem 1rem',
  fontFamily: 'monospace',
  fontWeight: 'bold',
  cursor: 'pointer',
}

export default function Dashboard() {
  const [me, setMe] = useState(null)
  const [team, setTeam] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMsg, setInviteMsg] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const [meResponse, teamResponse] = await Promise.all([
        api.get('/api/me'),
        api.get('/api/team'),
      ])
      setMe(meResponse.data)
      setTeam(teamResponse.data)
      setError('')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        navigate('/login', { replace: true })
      } else {
        setError(requestError.response?.data?.error || 'Could not load the dashboard.')
      }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    load()
  }, [load])

  async function handleInvite(event) {
    event.preventDefault()
    setInviteMsg(null)
    setInviting(true)

    try {
      const response = await api.post('/api/team/invite', { email: inviteEmail, role: 'member' })
      setInviteMsg({
        ok: true,
        text: response.data.inviteUrl
          ? `Invite email sent. Invite link: ${response.data.inviteUrl}`
          : 'Invite sent.',
      })
      setInviteEmail('')
    } catch (requestError) {
      setInviteMsg({ ok: false, text: requestError.response?.data?.error || 'Could not send invite.' })
    } finally {
      setInviting(false)
    }
  }

  async function handleLogout() {
    const refreshToken = localStorage.getItem('refreshToken')
    try {
      if (refreshToken) {
        await api.post('/api/auth/logout', { refreshToken })
      }
    } finally {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      navigate('/login', { replace: true })
    }
  }

  if (loading) {
    return <main style={{ background: '#0B0B0D', minHeight: '100vh', color: '#A6A6AC', fontFamily: 'monospace', padding: '2rem' }}>Loading dashboard…</main>
  }

  if (!me) {
    return <main role="alert" style={{ background: '#0B0B0D', minHeight: '100vh', color: '#FF6B45', fontFamily: 'monospace', padding: '2rem' }}>{error || 'Dashboard unavailable.'}</main>
  }

  const canInvite = me.role === 'owner' || me.role === 'admin'

  return (
    <main style={{ background: '#0B0B0D', minHeight: '100vh', color: '#F5F5F3', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ color: '#FF6B45' }}>{me.company?.name || 'Your company'}</h1>
        <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #26262A', borderRadius: '6px', padding: '0.4rem 0.8rem', color: '#A6A6AC', cursor: 'pointer' }}>
          Log out
        </button>
      </div>
      <p style={{ color: '#A6A6AC' }}>Logged in as {me.name} ({me.role})</p>

      {error && <p role="alert" style={{ color: '#FF6B45' }}>{error}</p>}

      <h2 style={{ color: '#7C6FF0', marginTop: '2rem', fontSize: '1rem' }}>Team</h2>
      <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem', textAlign: 'left' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {team.map((member) => (
            <tr key={member._id} style={{ borderBottom: '1px solid #1E1E22' }}>
              <td style={{ padding: '0.4rem 0' }}>{member.name}</td>
              <td style={{ color: '#A6A6AC' }}>{member.email}</td>
              <td style={{ color: '#4AD3C9' }}>{member.role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {canInvite && (
        <form onSubmit={handleInvite} style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="teammate@email.com"
            required
            style={inputStyle}
          />
          <button type="submit" disabled={inviting} style={buttonStyle}>{inviting ? 'Sending…' : 'Invite'}</button>
        </form>
      )}
      {inviteMsg && <p role="status" style={{ color: inviteMsg.ok ? '#4AD3C9' : '#FF6B45', fontSize: '0.85rem', marginTop: '0.5rem', overflowWrap: 'anywhere' }}>{inviteMsg.text}</p>}
    </main>
  )
}
