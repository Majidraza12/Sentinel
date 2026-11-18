import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import ConsolePage from './pages/ConsolePage'
import ResultsPage from './pages/ResultsPage'
import MethodPage from './pages/MethodPage'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<ConsolePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/method" element={<MethodPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
