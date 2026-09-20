/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const TOKEN_KEY = 'quizcraft_access_token'

const AuthContext = createContext(null)

async function readResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload.detail === 'string' ? payload.detail : fallback)
  }
  return payload
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) return undefined

    let cancelled = false
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => readResponse(response, 'Unable to restore your session.'))
      .then((profile) => {
        if (!cancelled) setUser(profile)
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  async function authenticate(path, credentials) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    const payload = await readResponse(response, 'Authentication failed.')
    localStorage.setItem(TOKEN_KEY, payload.access_token)
    setToken(payload.access_token)
    setUser(payload.user)
    return payload.user
  }

  async function signup(credentials) {
    return authenticate('/auth/signup', credentials)
  }

  async function login(credentials) {
    return authenticate('/auth/login', credentials)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, authLoading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

export function getApiBase() {
  return API_BASE
}
