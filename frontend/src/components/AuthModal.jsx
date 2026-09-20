import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

function AuthModal({ mode, onClose, onModeChange }) {
  const { login, signup } = useAuth()
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isSignup = mode === 'signup'

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      if (isSignup) {
        await signup(form)
      } else {
        await login({ email: form.email, password: form.password })
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close authentication modal">×</button>
        <p className="eyebrow">QuizCraft account</p>
        <h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
        <p className="modal-copy">{isSignup ? 'Save every score and build your learning streak.' : 'Sign in to continue your quiz journey.'}</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup && (
            <label>
              Username
              <input required minLength="2" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
            </label>
          )}
          <label>
            Email
            <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label>
            Password
            <input required minLength="6" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" className="primary-button full-width" disabled={submitting}>
            {submitting ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup ? 'Already have an account?' : 'New to QuizCraft?'}{' '}
          <button type="button" onClick={() => onModeChange(isSignup ? 'login' : 'signup')}>
            {isSignup ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </section>
    </div>
  )
}

export default AuthModal
