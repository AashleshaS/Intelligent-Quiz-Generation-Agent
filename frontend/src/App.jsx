import { useEffect, useRef, useState } from 'react'
import './App.css'
import AuthModal from './components/AuthModal.jsx'
import { getApiBase, useAuth } from './context/AuthContext.jsx'

const API_BASE = getApiBase()

async function getApiError(response, fallbackMessage) {
  let detail = ''
  try {
    const payload = await response.json()
    detail = typeof payload.detail === 'string' ? payload.detail : ''
  } catch {
    // Use a stable user-facing fallback when the server returns no JSON.
  }

  if (response.status === 429 || detail.toLowerCase().includes('quota')) {
    return 'API limit reached. Please retry in a few moments.'
  }
  if (response.status >= 500) {
    return 'The service is temporarily unavailable. Please try again shortly.'
  }
  return detail || fallbackMessage
}

function App() {
  const { user, authLoading, logout } = useAuth()
  const [activeMode, setActiveMode] = useState('topic')
  const [topic, setTopic] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState([])
  const [selectedAnswers, setSelectedAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [difficulty, setDifficulty] = useState('Mixed')
  const [questionCount, setQuestionCount] = useState(10)
  const [timerDuration, setTimerDuration] = useState(60)
  const [remainingTime, setRemainingTime] = useState(60)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [authModal, setAuthModal] = useState(null)
  const fileInputRef = useRef(null)

  const score = questions.reduce((total, question, index) => {
    if (selectedAnswers[index] === question.correct_answer) {
      return total + 1
    }
    return total
  }, 0)

  const allAnswered = questions.length > 0 && questions.every((_, index) => selectedAnswers[index])

  function resetQuizState() {
    setQuestions([])
    setSelectedAnswers({})
    setSubmitted(false)
    setError('')
    setRemainingTime(timerDuration)
    setCurrentQuestionIndex(0)
  }

  useEffect(() => {
    if (!questions.length || submitted || !timerDuration) return undefined

    const timer = window.setInterval(() => {
      setRemainingTime((currentTime) => {
        if (currentTime <= 1) {
          window.clearInterval(timer)
          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex((index) => index + 1)
            setError('Time is up for this question. Moving to the next one.')
            return timerDuration
          }
          setSubmitted(true)
          setError('Time is up. Your quiz has been submitted.')
          return 0
        }
        return currentTime - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [currentQuestionIndex, questions.length, submitted, timerDuration])

  function normalizeQuestions(payload) {
    if (!payload) return []
    if (Array.isArray(payload)) return payload
    if (payload.questions) return payload.questions
    if (payload.quiz && payload.quiz.questions) return payload.quiz.questions
    return []
  }

  function handleAnswerChange(questionIndex, option) {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: option,
    }))
  }

  async function generateTopicQuiz() {
    if (!topic.trim()) {
      setError('Please enter a topic before generating the quiz.')
      return
    }

    setLoading(true)
    setError('')
    setSubmitted(false)

    try {
      const response = await fetch(`${API_BASE}/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          difficulty,
          question_count: questionCount,
        }),
      })

      if (!response.ok) {
        throw new Error(await getApiError(response, 'Unable to generate the quiz from this topic.'))
      }

      const data = await response.json()
      const normalizedQuestions = normalizeQuestions(data.quiz)

      if (!normalizedQuestions.length) {
        throw new Error('No questions were returned by the backend.')
      }

      setQuestions(normalizedQuestions)
      setSelectedAnswers({})
      setRemainingTime(timerDuration)
      setCurrentQuestionIndex(0)
    } catch (err) {
      const message =
        err instanceof TypeError
          ? 'Could not connect to the backend. Please make sure the backend server is running on http://localhost:8000.'
          : err.message || 'Something went wrong while generating the quiz.'

      setError(message)
      setQuestions([])
    } finally {
      setLoading(false)
    }
  }

  async function generatePdfQuiz() {
    if (!selectedFile) {
      setError('Please upload a PDF file first.')
      return
    }

    setLoading(true)
    setError('')
    setSubmitted(false)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const params = new URLSearchParams({
        difficulty,
        question_count: String(questionCount),
      })
      const response = await fetch(`${API_BASE}/generate-quiz-pdf?${params}`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(await getApiError(response, 'Unable to generate a quiz from this PDF.'))
      }

      const data = await response.json()
      const normalizedQuestions = normalizeQuestions(data.quiz)

      if (!normalizedQuestions.length) {
        throw new Error('No questions were returned from the PDF.')
      }

      setQuestions(normalizedQuestions)
      setSelectedAnswers({})
      setRemainingTime(timerDuration)
      setCurrentQuestionIndex(0)
    } catch (err) {
      const message =
        err instanceof TypeError
          ? 'Could not connect to the backend. Please make sure the backend server is running on http://localhost:8000.'
          : err.message || 'Something went wrong while processing the PDF.'

      setError(message)
      setQuestions([])
    } finally {
      setLoading(false)
    }
  }

  function handleFileUpload(file) {
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
      setError('')
    } else {
      setError('Please upload a valid PDF file.')
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  function handleSubmitQuiz(allowIncomplete = false) {
    if (!allAnswered && remainingTime > 0 && !allowIncomplete) {
      setError('Please answer all questions before submitting.')
      return
    }

    setSubmitted(true)
    setError('')
  }

  const formattedTime = `${Math.floor(remainingTime / 60)}:${String(remainingTime % 60).padStart(2, '0')}`

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Learning platform</p>
          <h1>QuizCraft AI</h1>
        </div>

        {!authLoading && (user ? (
          <div className="account-actions">
            <span className="profile-button"><span className="profile-icon">{user.username[0].toUpperCase()}</span>{user.username}</span>
            <button type="button" className="secondary-button" onClick={logout}>Logout</button>
          </div>
        ) : (
          <div className="account-actions">
            <button type="button" className="secondary-button" onClick={() => setAuthModal('login')}>Login</button>
            <button type="button" className="primary-button compact-button" onClick={() => setAuthModal('signup')}>Sign Up</button>
          </div>
        ))}
      </header>

      {!questions.length && !loading && !submitted && (
        <main className="dashboard">
          <section className="welcome-card">
            <p className="eyebrow">Your learning space</p>
            <h2>{user ? `👋 Welcome back, ${user.username}! Ready for today's challenge?` : '👋 Welcome! Sign in to track your scores and save quiz history.'}</h2>
          </section>

          <div className="mode-tabs" role="tablist" aria-label="Quiz modes">
            <button
              type="button"
              className={activeMode === 'topic' ? 'tab active' : 'tab'}
              onClick={() => {
                setActiveMode('topic')
                setError('')
              }}
            >
              Topic Mode
            </button>
            <button
              type="button"
              className={activeMode === 'pdf' ? 'tab active' : 'tab'}
              onClick={() => {
                setActiveMode('pdf')
                setError('')
              }}
            >
              PDF Mode
            </button>
          </div>

          {activeMode === 'topic' ? (
            <section className="panel input-panel">
              <label htmlFor="topic-input" className="panel-label">
                Enter a topic to generate your quiz
              </label>

              <div className="input-row">
                <input
                  id="topic-input"
                  type="text"
                  value={topic}
                  placeholder="e.g. Python Basics, Machine Learning, World History"
                  onChange={(event) => setTopic(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') generateTopicQuiz()
                  }}
                />
                <button type="button" className="primary-button" onClick={generateTopicQuiz}>
                  Generate Quiz
                </button>
              </div>

              <div className="settings-grid">
                <label>
                  Difficulty
                  <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                    <option value="Mixed">Mixed</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </label>
                <label>
                  Questions
                  <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                  </select>
                </label>
                <label>
                  Per-question timer
                  <select value={timerDuration} onChange={(event) => setTimerDuration(Number(event.target.value))}>
                    <option value={0}>Off</option>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </label>
              </div>
            </section>
          ) : (
            <section className="panel upload-panel">
              <label className="panel-label">Upload a PDF to generate a quiz</label>

              <div
                className={isDragging ? 'dropzone active' : 'dropzone'}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={(event) => handleFileUpload(event.target.files?.[0])}
                />

                <div className="drop-icon">📄</div>
                <p>
                  {selectedFile ? selectedFile.name : 'Drag and drop your PDF here or click to upload'}
                </p>
                <span>Supports .pdf documents only</span>
              </div>

              <button type="button" className="primary-button full-width" onClick={generatePdfQuiz}>
                Generate Quiz from PDF
              </button>
              <div className="settings-grid">
                <label>
                  Difficulty
                  <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                    <option value="Mixed">Mixed</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </label>
                <label>
                  Questions
                  <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                  </select>
                </label>
                <label>
                  Per-question timer
                  <select value={timerDuration} onChange={(event) => setTimerDuration(Number(event.target.value))}>
                    <option value={0}>Off</option>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </label>
              </div>
            </section>
          )}

          {error && <div className="error-box">{error}</div>}
        </main>
      )}

      {loading && (
        <main className="loading-screen">
          <div className="loader" aria-label="Loading quiz" />
          <h2>Generating your quiz...</h2>
          <p>Our AI agent is preparing personalized questions for you.</p>
        </main>
      )}

      {!loading && questions.length > 0 && !submitted && (
        <main className="quiz-screen">
          <div className="quiz-header">
            <div>
              <p className="eyebrow">AI generated</p>
              <h2>Quiz Challenge</h2>
            </div>
            <div className="quiz-actions">
              {timerDuration > 0 && <span className={remainingTime <= 10 ? 'timer urgent' : 'timer'}>Question time {formattedTime}</span>}
              <button type="button" className="secondary-button" onClick={resetQuizState}>
                Change Topic
              </button>
            </div>
          </div>

          <div className="questions-list">
            {(() => {
              const question = questions[currentQuestionIndex]
              return (
                <article className="question-card">
                  <p className="question-number">Question {currentQuestionIndex + 1} of {questions.length}</p>
                  <h3>{question.question_text}</h3>

                  <div className="options-grid">
                    {question.options.map((option, optionIndex) => {
                      const isSelected = selectedAnswers[currentQuestionIndex] === option

                      return (
                        <button
                          key={optionIndex}
                          type="button"
                          className={isSelected ? 'option-card selected' : 'option-card'}
                          onClick={() => handleAnswerChange(currentQuestionIndex, option)}
                        >
                          <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                          <span>{option}</span>
                        </button>
                      )
                    })}
                  </div>
                </article>
              )
            })()}
          </div>

          {error && <div className="error-box">{error}</div>}

          <div className="submit-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (!selectedAnswers[currentQuestionIndex]) {
                  setError('Please answer this question before continuing.')
                  return
                }
                if (currentQuestionIndex === questions.length - 1) {
                  handleSubmitQuiz(true)
                } else {
                  setCurrentQuestionIndex((index) => index + 1)
                  setRemainingTime(timerDuration)
                  setError('')
                }
              }}
            >
              {currentQuestionIndex === questions.length - 1 ? 'Submit Quiz' : 'Next Question'}
            </button>
          </div>
        </main>
      )}

      {!loading && submitted && questions.length > 0 && (
        <main className="results-screen">
          <div className="result-card">
            <div className="result-header">
              <p className="eyebrow">Results</p>
              <h2>Your Score</h2>
            </div>

            <div className="score-ring">
              <strong>
                {score}/{questions.length}
              </strong>
            </div>

            <div className="result-summary">
              <p>
                You answered <span>{score}</span> out of <span>{questions.length}</span> correctly.
              </p>
            </div>

            <div className="answers-list">
              {questions.map((question, index) => {
                const isCorrect = selectedAnswers[index] === question.correct_answer
                return (
                  <div key={index} className={isCorrect ? 'answer-item correct' : 'answer-item wrong'}>
                    <p className="answer-question">{question.question_text}</p>
                    <div className="answer-meta">
                      <span>Your answer: {selectedAnswers[index] || 'Not answered'}</span>
                      <span>Correct answer: {question.correct_answer}</span>
                    </div>
                    <p className="answer-explanation">
                      <strong>Why:</strong> {question.explanation || 'The correct option matches the concept tested in this question.'}
                    </p>
                  </div>
                )
              })}
            </div>

            <button type="button" className="primary-button" onClick={resetQuizState}>
              Try Another Quiz
            </button>
          </div>
        </main>
      )}
      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onModeChange={setAuthModal} />}
    </div>
  )
}

export default App
