import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api.js'

const inputStyle = {
  background: '#17171A',
  border: '1px solid #26262A',
  borderRadius: '6px',
  padding: '0.6rem',
  color: '#F5F5F3',
  fontFamily: 'monospace',
}

const buttonStyle = {
  background: '#FF6B45',
  color: '#0B0B0D',
  border: 'none',
  borderRadius: '6px',
  padding: '0.6rem',
  fontFamily: 'monospace',
  fontWeight: 'bold',
  cursor: 'pointer',
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [form, setForm] = useState({ name: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const response = await api.post('/api/team/accept-invite', { token, ...form })
      localStorage.setItem('accessToken', response.data.accessToken)
      localStorage.setItem('refreshToken', response.data.refreshToken)
      navigate('/dashboard')
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not accept invite. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{ background: '#0B0B0D', minHeight: '100vh', color: '#F5F5F3', fontFamily: 'monospace', padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
      <h1 style={{ color: '#FF6B45' }}>Join your team</h1>
      {!token && <p role="alert" style={{ color: '#FF6B45' }}>This invite link is missing its token.</p>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '1rem' }}>
        <input name="name" value={form.name} placeholder="Your name" onChange={handleChange} required style={inputStyle} />
        <input name="password" type="password" value={form.password} placeholder="Choose a password (8+ characters)" onChange={handleChange} minLength={8} required style={inputStyle} />
        <button type="submit" disabled={!token || submitting} style={buttonStyle}>{submitting ? 'Joining…' : 'Join'}</button>
        {error && <p role="alert" style={{ color: '#FF6B45', fontSize: '0.85rem' }}>{error}</p>}
      </form>
    </main>
  )
}
