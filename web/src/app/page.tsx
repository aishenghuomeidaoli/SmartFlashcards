import Link from "next/link";

/**
 * 落地页：**服务端渲染**（这是要 SSR 的主要原因）。
 * 内容是静态的营销文案，但必须出现在 HTML 里 —— CSR 时爬虫和社交平台只拿到空壳。
 */
export default function LandingPage() {
  return (
    <div className="space-y-20">
      <section className="pt-10">
        <p className="mb-4 inline-block rounded-full border border-line px-3 py-1 text-xs text-muted">
          AI flashcards · Spaced repetition · Works with scanned PDFs
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
          Turn the PDFs you already have into
          <span className="text-brand"> cards you actually review</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Upload a textbook, a set of lecture notes, or a past exam. Every page is read
          individually, headers and footers are stripped out, and the result becomes one clean
          study document — which is then split into flashcards. When each card comes back is
          decided by a spaced-repetition algorithm, so all you have to do is show up once a day.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-brand px-5 py-3 font-medium text-on-brand hover:opacity-90"
          >
            Start free
          </Link>
          <Link
            href="/#how"
            className="rounded-xl border border-line px-5 py-3 font-medium hover:border-brand"
          >
            See how it works
          </Link>
        </div>
      </section>

      <section id="how" className="space-y-8">
        <h2 className="text-2xl font-semibold">Three steps from raw material to long-term memory</h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Upload a PDF",
              d: "Textbooks, lecture notes, past exam papers — anything. Files are deduplicated by content hash, so uploading the same document twice costs nothing.",
            },
            {
              n: "02",
              t: "Get a study document",
              d: "Pages are read and merged into one clean knowledge asset: headers, footers and page numbers removed, tables, formulas and question numbering preserved.",
            },
            {
              n: "03",
              t: "Generate cards and review",
              d: "Split the document into Q&A cards in one click. The FSRS algorithm decides when each card should come back.",
            },
          ].map((s) => (
            <li key={s.n} className="rounded-2xl border border-line bg-surface/40 p-6">
              <div className="text-sm text-brand">{s.n}</div>
              <h3 className="mt-2 text-lg font-medium">{s.t}</h3>
              <p className="mt-2 leading-relaxed text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Why this is not "just another flashcard app"</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Content first", "The content comes from your own material before anything is said about memorising it. No preset decks, no filler question banks."],
            ["No manual step", "Upload to result is fully automatic. There is no page-by-page proofreading or tidying up for you to do."],
            ["Real exam layout", "Question numbers, answer options and worked solutions survive as structure instead of being flattened into one block of text."],
            ["Long-term, not streaks", "Review timing follows memory stability. There is no streak to keep alive."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-line p-5">
              <h3 className="font-medium">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface/40 p-8">
        <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
        <dl className="mt-6 space-y-5">
          {[
            ["How large can a PDF be?", "Up to 100MB per file, with no page limit. A few dozen pages usually finish in a minute or two; a several-hundred-page book is processed in batches."],
            ["Can you read scanned documents?", "Yes. Every page goes through a vision model, so it makes no difference whether the PDF has a text layer."],
            ["What if the extraction is wrong?", "You can reprocess the whole file from its document page. Intermediate results are all stored, so a rerun does not pay for the same work twice."],
            ["Does it handle non-English documents?", "Headers, footers, watermarks and page numbers are stripped automatically, and question and option structure is preserved."],
          ].map(([q, a]) => (
            <div key={q}>
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1 leading-relaxed text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="pb-10 text-center">
        <h2 className="text-2xl font-semibold">Make that PDF you already have finally useful</h2>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-brand px-6 py-3 font-medium text-on-brand hover:opacity-90"
        >
          Sign in and upload a PDF
        </Link>
      </section>
    </div>
  );
}
