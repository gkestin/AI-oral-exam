export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">AI Oral Exam System</h1>
      <p className="text-lg text-gray-600 mb-8">
        Scalable, AI-powered oral examinations
      </p>
      <div className="flex gap-4">
        <a
          href="/login"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Sign In
        </a>
        <a
          href="/about"
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          Learn More
        </a>
      </div>
    </main>
  )
}
