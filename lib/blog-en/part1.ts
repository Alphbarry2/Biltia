// ─────────────────────────────────────────────────────────────────────────────
// BLOG EN — partie 1/4. Traduction des articles 1 à 4 de lib/blog.ts.
// Seul le TEXTE est traduit : slug, date, updated, readingMinutes et
// relatedProduct restent repris de la source FR.
// ─────────────────────────────────────────────────────────────────────────────

import type { BlogPostEn } from "@/lib/blog-i18n";

export const BLOG_EN_1: Record<string, BlogPostEn> = {
  // 1 ───────────────────────────────────────────────────────────────────────
  "suivi-de-chantier-sans-excel": {
    title: "Job site tracking: why 2026 is the year to drop Excel",
    description:
      "Excel hits its limits fast once you juggle several job sites. Here are the warning signs, and how to move to a tool that speaks your language.",
    category: "Tools",
    keywords: [
      "job site tracking",
      "construction tracking software",
      "job site dashboard",
      "contractor job management",
      "Excel alternative for construction",
    ],
    excerpt:
      "The spreadsheet did the job at first. But by the third job site, it becomes the problem rather than the solution.",
    intro:
      "Almost every tradesperson starts tracking job sites in a spreadsheet. It is free, flexible and familiar. But as soon as the number of sites goes up, Excel turns into a source of errors and wasted time. Here is how to spot the moment to switch, and what to switch to.",
    sections: [
      {
        heading: "Why everyone starts with Excel",
        body: [
          "A spreadsheet takes no learning at all: you open a sheet, type a few columns, and five minutes later you have a tracker. For a first job site, that is more than enough.",
          "The problem is not Excel itself, it is what you ask it to do once the business grows. A tool built for calculations quickly becomes a poor tool for running a company.",
        ],
      },
      {
        heading: "The signs that Excel is no longer enough",
        body: [
          "A spreadsheet is a static file: it warns you about nothing and never updates itself. The same symptoms come up with every tradesperson who has outgrown the spreadsheet stage.",
        ],
        list: [
          "You no longer know which version of the file is the right one",
          "The amount left to invoice is wrong the moment a line item changes",
          "Nobody on site ever updates the file",
          "Digging up the history of a job site takes ten minutes",
          "You find out about a delay or a cost overrun far too late",
        ],
      },
      {
        heading: "The hidden cost of the spreadsheet",
        body: [
          "Excel looks free, but it is expensive in time and money. Every re-entry, every broken formula and every piece of information you hunt for is a minute that does not go into the job site.",
          "The real cost is also what slips through the cracks: a follow-up that never goes out, a line item you forget to invoice, an overrun spotted too late. Added up over a year, those small misses weigh heavily on your margin.",
        ],
      },
      {
        heading: "What good tracking should actually give you",
        body: [
          "The goal is not to add complexity, it is to have the right information at the right time, including from the job site itself.",
        ],
        list: [
          "Progress and the amount left to invoice, per job site, always up to date",
          "Alerts on delays and budget overruns",
          "Simple access from a phone, out in the field",
          "A history you can consult without digging through folders",
          "A clear link between a job site, its client and its documents",
        ],
      },
      {
        heading: "The usual blocker: fear of the bloated system",
        body: [
          "Plenty of tradespeople have tried a heavyweight management package and gone straight back to Excel, with no time to configure it. That risk is real: a tool that demands a week of training ends up unused.",
          "The answer is not one more piece of software with a hundred menus. It is a tool that adapts to the way you work, not the other way around.",
        ],
      },
      {
        heading: "A tool you build with your voice",
        body: [
          "With Biltia, you configure nothing: you describe the tracking you want, for example a job site tracker with the client, progress as a percentage and the amount left to invoice, and the app is generated for you.",
          "You then adjust it by voice: add a column, an alert, a status. No menus, no endless setup. And because the tracker lives in the same space as your clients and your documents, everything stays connected.",
        ],
      },
      {
        heading: "Where to start without breaking anything",
        body: [
          "There is no need to switch everything at once. Start with your busiest job site, the one that costs you the most time to track, and generate its dashboard.",
          "Once the habit sticks, you add the other sites in a few sentences. The spreadsheet can stay as a backup at first, but you will find it quickly becomes pointless.",
        ],
      },
    ],
    takeaways: [
      "Excel is fine for a single job site, but it hits its limits as soon as several run in parallel.",
      "What you really need: progress, amount left to invoice, alerts and mobile access.",
      "A tool that is too heavy ends up abandoned: simplicity beats feature count.",
      "A tracker generated from a plain description means zero configuration.",
      "Start with the job site that eats the most of your time, so the habit sticks.",
    ],
    faq: [
      {
        q: "Is Excel really a problem for a tradesperson?",
        a: "Excel works for a single, simple job site. Beyond that, the lack of alerts, data entry mistakes and multiple versions of the same file cost you time and money.",
      },
      {
        q: "Do you need training to use job site tracking software?",
        a: "It depends on the tool. Heavyweight solutions require configuration. A tool that builds itself from a plain description in everyday language removes most of that friction.",
      },
      {
        q: "Can you track a job site from the field?",
        a: "Yes, as long as the tool works on a phone. That is exactly where the spreadsheet falls short, because nobody ever updates it on site.",
      },
    ],
    cta: "I want a tracker for my job sites with the client, progress as a percentage and the amount left to invoice.",
  },

  // 2 ───────────────────────────────────────────────────────────────────────
  "comparatif-logiciels-btp": {
    title: "Construction software compared in 2026: which one is right for your business",
    description:
      "Spreadsheet, quoting software, full ERP, no-code or conversational assistant: the construction tool comparison to help you choose well in 2026.",
    category: "Comparison",
    keywords: [
      "construction software comparison",
      "building management software",
      "best software for tradespeople",
      "construction ERP",
      "quoting software alternative",
    ],
    excerpt:
      "Five families of tools, five philosophies. Here is how they stack up, and where Biltia fits in.",
    intro:
      "Choosing a tool to run a construction business has never been harder, simply because there are so many options. The clearest way through is to think in families of tools, each with its own logic, strengths and limits. Here is an honest comparison, and where Biltia stands.",
    sections: [
      {
        heading: "1. The spreadsheet (Excel, Google Sheets)",
        body: [
          "This is where almost every tradesperson starts. Free or close to it, flexible, no learning curve. You throw everything in: tracking, quotes, scheduling, hours.",
          "The ceiling comes fast: a spreadsheet is static. It connects nothing, warns you about nothing, and updates only by hand. As soon as the business grows, it becomes a source of errors and duplicate versions.",
        ],
        list: [
          "Pros: free, flexible, instant",
          "Cons: static, no alerts, data entry mistakes, does not scale",
        ],
      },
      {
        heading: "2. Quoting and invoicing software",
        body: [
          "Solutions like Obat, Tolteck, Mediabat or the construction modules from EBP are built for one precise job: producing clean quotes and invoices, backed by a price library.",
          "They do very well what they were designed to do. But their scope stays centred on billing. Job site tracking, questions about your own data or bespoke tasks usually fall outside their remit, and you end up juggling other tools.",
        ],
        list: [
          "Pros: polished quotes and invoices, price catalogues",
          "Cons: scope limited to billing, subscription, does not cover everything",
        ],
      },
      {
        heading: "3. Full ERP and management suites",
        body: [
          "Packages like Batigest, Codial or the big construction management suites aim for completeness: quotes, purchasing, stock, accounting, payroll, all in one place.",
          "That breadth comes at a price. These tools have a reputation for being powerful but heavy to roll out, slow to configure, and designed for a desk rather than a job site. For a solo tradesperson or a small crew, they are usually oversized.",
        ],
        list: [
          "Pros: very wide coverage, suited to companies with a back office",
          "Cons: expensive, slow to configure, steep learning curve, poor on mobile",
        ],
      },
      {
        heading: "4. Generic no-code tools",
        body: [
          "Notion, Airtable and the like let you build your own tools without a developer. It is flexible and modern.",
          "The flip side is that you have to build everything yourself, and none of it is designed for construction. You spend time designing your database instead of working, and the result is still a generic tool.",
        ],
        list: [
          "Pros: flexible, customisable",
          "Cons: everything has to be built, not construction specific, time consuming up front",
        ],
      },
      {
        heading: "5. The conversational assistant: Biltia",
        body: [
          "Biltia starts from a different idea: instead of picking a piece of software and then learning to use it, you describe your problem in plain language, by text or by voice, and the tool delivers the solution.",
          "Depending on the request, Biltia switches to the right format on its own: a document ready to sign, a bespoke business app, an answer sourced from your own data, or an automation. You never pick the tool, you describe the need. And it all builds on your company memory, which gets richer with every request.",
        ],
        list: [
          "Pros: zero configuration, a single bar, mobile, voice dictation, built on your own data",
          "Cons: a new approach, one you have to adopt as a new habit",
        ],
      },
      {
        heading: "The comparison in a nutshell",
        body: [
          "Compare them on the criteria that actually matter to a tradesperson and the differences jump out.",
        ],
        list: [
          "Time to get going: spreadsheet instant, ERP long, Biltia instant",
          "Scope: spreadsheet broad but improvised, quoting tools narrow, ERP very broad, Biltia broad and guided",
          "On the job site: spreadsheets and ERPs are a poor fit, Biltia is built for mobile and voice",
          "Configuration: heavy for an ERP, none for Biltia",
          "Connected data: weak in a spreadsheet, strong in Biltia thanks to the workspace",
        ],
      },
      {
        heading: "So which one should you choose?",
        body: [
          "There is no single answer. If all you do is quotes, invoicing software may be enough. If you have a structured back office and heavy volume, an ERP makes a solid case.",
          "But if you are a tradesperson or a small crew, if you want to save time without sitting through training, and work from the job site as much as from the office, Biltia's conversational approach was designed for exactly that. The simplest test is to try it on a real need.",
        ],
      },
    ],
    takeaways: [
      "Five families of tools: spreadsheet, quoting software, ERP, generic no-code, conversational assistant.",
      "The spreadsheet is free but static; the ERP is complete but heavy and poor on mobile.",
      "Quoting software is excellent at billing but covers a narrow scope.",
      "Biltia removes configuration entirely and covers documents, apps, answers and automations from a single bar.",
      "The right choice depends on your size and your need: try it on a real case before deciding.",
    ],
    faq: [
      {
        q: "What is the best construction software for a solo tradesperson?",
        a: "For a solo tradesperson, what matters is simplicity and speed of setup. A tool with no configuration, usable from the job site, often pays off better than a complete but heavy ERP.",
      },
      {
        q: "Does Biltia replace quoting software?",
        a: "Biltia produces documents such as quotes, but it goes further: it also builds tracking apps, answers questions about your data and automates tasks, all from a single interface.",
      },
      {
        q: "Do you have to abandon Excel to move to a dedicated tool?",
        a: "Not necessarily all at once. Many people start by handing their most time consuming job site to a dedicated tool, then expand once the time saved becomes obvious.",
      },
    ],
    cta: "Show me what Biltia can do for my business: a job site tracker and a quote, right now.",
  },

  // 3 ───────────────────────────────────────────────────────────────────────
  "comment-fonctionne-biltia": {
    title: "How Biltia works: one bar, all your tools",
    description:
      "Biltia starts from your problem, not from a menu. See how it picks between a document, an app, an answer and an automation.",
    category: "Guide",
    keywords: [
      "how Biltia works",
      "construction assistant",
      "conversational building software",
      "AI tool for tradespeople",
      "Biltia guide",
    ],
    excerpt:
      "No menus, no modules to learn. You describe, Biltia delivers. Here is what happens behind the scenes.",
    intro:
      "Most software asks you to pick a module first, then learn how to use it. Biltia does the opposite: you describe your problem the way you would to a colleague, and the tool handles the rest. Here is exactly how it works.",
    sections: [
      {
        heading: "The principle: you describe, Biltia solves",
        body: [
          "It all starts with a single bar. You type into it, or you dictate, whatever you need: a document, a tracker, an answer, a check.",
          "You do not have to know which category it belongs to. Understanding the request and picking the right way to answer it is precisely Biltia's job.",
        ],
      },
      {
        heading: "The four answer formats",
        body: [
          "Behind the bar, Biltia knows how to produce four kinds of solution, depending on what you ask for.",
        ],
        list: [
          "A document: a quote, a letter, a report, ready to print or send",
          "An app: a job site tracker, a time sheet, an inventory, generated to fit",
          "An answer: a question about your data gets an answer backed by that data",
          "An automation: a check or a file reconciliation done in a single pass",
        ],
      },
      {
        heading: "How Biltia picks the right format",
        body: [
          "Biltia reads your sentence and the context of your company to decide. A request that starts with produce or write leads to a document. A request for a tracker or a table leads to an app. A question leads to an answer, a check leads to an automation.",
          "You see the chosen format on screen, and you can always redirect it if you need to. The idea is to spare you the mental load of choosing, not to take away your control.",
        ],
      },
      {
        heading: "Your company memory",
        body: [
          "Biltia does not start from scratch every time. Your clients, your job sites, your documents and your teams live in a single space, the workspace.",
          "The result: when you ask for a quote for a client, Biltia already knows their details and their job sites. The more you use the tool, the more relevant it gets, because it knows more about your business.",
        ],
      },
      {
        heading: "By voice, on the job site",
        body: [
          "Biltia is built to be used with dirty hands, from a phone. You tap the mic, you speak, and the request goes out.",
          "That is what changes everything compared with desktop software: you do not wait until you are back home in the evening to act, you do it between two tasks on site.",
        ],
      },
      {
        heading: "What Biltia is not",
        body: [
          "Biltia is not an ERP with a hundred menus that takes weeks to configure. Nor is it a simple text generator disconnected from your business.",
          "It is a single entry point that draws on your real data and picks the right tool on your behalf. The promise is simple: less admin, more time on site.",
        ],
      },
      {
        heading: "A day to day example",
        body: [
          "Picture it: on site, a client approves a change. You dictate the request to Biltia, which produces the priced document to be signed. Back at the office, you ask which job sites are running late, and you get the answer in one sentence.",
          "The same tool produced a document, then an analysis, without you ever switching applications. That is the whole idea behind one bar for all your tools.",
        ],
      },
    ],
    takeaways: [
      "Biltia starts from your problem described in plain language, not from a menu you have to pick.",
      "Four answer formats: document, app, answer and automation.",
      "The tool picks the right format while leaving you in control.",
      "Everything builds on your company memory, which gets richer with every request.",
      "Designed for voice and for the job site, not just for the office.",
    ],
    faq: [
      {
        q: "Do I have to pick a module before I start?",
        a: "No. You simply describe what you need in a single bar, and Biltia picks the right answer format itself.",
      },
      {
        q: "Does Biltia remember my clients and job sites?",
        a: "Yes. Your data lives in a single workspace. Biltia reuses it to pre-fill your documents and answer your questions.",
      },
      {
        q: "Can I use Biltia from the job site?",
        a: "Yes, and that is exactly what it is built for. Biltia runs on a phone and accepts voice dictation, so you can act without going back to the office.",
      },
    ],
    cta: "Explain what you can do, then prepare a quote for my next client.",
  },

  // 4 ───────────────────────────────────────────────────────────────────────
  "ia-artisan-btp-taches-administratives": {
    title: "AI for tradespeople: 7 tasks to delegate and save time in 2026",
    description:
      "AI is no longer just for big firms. Here are 7 concrete tasks construction tradespeople can delegate to save time in 2026.",
    category: "Tips",
    keywords: [
      "AI in construction",
      "AI for tradespeople",
      "save time in construction",
      "construction automation",
      "artificial intelligence on the job site",
    ],
    excerpt:
      "Two hours of admin a day is two hours less on site. AI can win a good chunk of it back.",
    intro:
      "For a long time, AI was something only big firms talked about. Not any more. In 2026, a solo tradesperson can hand off a large share of their paperwork to tools that understand plain language. Here are seven concrete tasks, from quoting to tracking, that you can delegate starting today.",
    sections: [
      {
        heading: "1. Writing quotes, reports and letters",
        body: [
          "Writing documents is the single biggest drain on admin time. Describing the need in plain language and getting back a clean, priced document saves hours every week.",
          "Instead of starting from a blank template every time, you dictate the outline, and the tool takes care of the layout and the maths.",
        ],
      },
      {
        heading: "2. Checking batches of files in one go",
        body: [
          "Comparing thirty delivery notes with their quotes by hand is tedious and error prone. An automation spots price gaps, unknown references and duplicates in a single pass.",
          "You only review the handful of lines it flags, instead of combing through everything.",
        ],
      },
      {
        heading: "3. Answering questions about your data",
        body: [
          "Which job sites are running late, how much a client owes you, where a quote stands: instead of digging through your files, you ask the question and get an answer backed by your own data.",
          "It is a shift in posture: you question your business the way you would question an assistant who had been following everything.",
        ],
      },
      {
        heading: "4. Tracking job sites and getting alerts",
        body: [
          "A tracker that updates itself and warns you about delays or budget overruns beats a frozen spreadsheet hands down.",
          "AI tells you before the problem gets expensive, instead of letting you find out after the fact.",
        ],
      },
      {
        heading: "The next three tasks",
        body: [
          "Beyond those four uses, three more tasks lend themselves particularly well to delegation in a construction business.",
        ],
        list: [
          "5. Following up on quotes and reminders that went unanswered",
          "6. Extracting amounts and due dates from a batch of documents",
          "7. Generating the recurring tools: tracking, time sheets, inventory",
        ],
      },
      {
        heading: "How much time can you really save",
        body: [
          "The gains do not come from one spectacular task, but from dozens of micro-actions won back every day. A faster quote, a follow-up that goes out on its own, an answer found in ten seconds.",
          "Strung together, those minutes often add up to one or two hours a day, which is a full day a week handed back to the field.",
        ],
      },
      {
        heading: "The right habit: a single entry point",
        body: [
          "The mistake would be to stack up ten different tools. The point of a single assistant is that everything is centralised: you describe the problem, the tool picks the right answer.",
          "That is exactly the principle behind Biltia: one bar, which you talk to like a colleague, and which draws on your company memory.",
        ],
      },
    ],
    takeaways: [
      "In 2026, AI is within reach of a solo tradesperson, with no technical skills required.",
      "Writing, checking, answering and tracking are the most obvious pockets of time to reclaim.",
      "The gain comes from dozens of micro-actions won back, not from one single task.",
      "A single assistant saves you from juggling ten different tools.",
      "The most useful AI is the one that draws on your real data.",
    ],
    faq: [
      {
        q: "Is AI really useful for a small tradesperson?",
        a: "Yes. It is precisely the small outfits, with no admin staff, that save the most time by handing quotes, tracking and follow-ups to a smart tool.",
      },
      {
        q: "Do you need technical skills to use AI?",
        a: "Not with today's tools. Describing what you need in plain language, by text or by voice, is enough. The tool turns the request into a document or an app.",
      },
      {
        q: "How much time can AI save in the construction trades?",
        a: "It varies, but adding up all the delegated micro-tasks, many tradespeople win back one to two hours a day, close to a full day a week.",
      },
    ],
    cta: "Give me a status check on my business: job sites running late, quotes pending and tasks to handle today.",
  },
};
