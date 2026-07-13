// ─────────────────────────────────────────────────────────────────────────────
// BLOG EN — partie 3 (articles 9 à 12 de lib/blog.ts).
// Seul le TEXTE est traduit : slug, date, updated, readingMinutes et
// relatedProduct restent partagés avec la source FR.
// ─────────────────────────────────────────────────────────────────────────────

import type { BlogPostEn } from "@/lib/blog-i18n";

export const BLOG_EN_3: Record<string, BlogPostEn> = {
  // 9 ────────────────────────────────────────────────────────────────────────
  "erreurs-gestion-artisan-btp": {
    title: "7 management mistakes that cost contractors dearly",
    description:
      "Slow quotes, forgotten follow-ups, no tracking: here are the 7 most common management mistakes contractors make, and how to avoid them.",
    category: "Tips",
    keywords: [
      "contractor management mistakes",
      "construction business management",
      "contractor profitability",
      "construction management advice",
      "job site organization",
    ],
    excerpt:
      "It is not the big jobs that sink a company, it is the small management leaks repeated day after day.",
    intro:
      "Most tradespeople are excellent at their craft, but management stays the weak link. And it is not the big mistakes that hurt, it is the small ones, repeated every single day. Here are the seven most common, and how to fix them without becoming a full-time manager.",
    sections: [
      {
        heading: "1. Taking too long to send a quote",
        body: [
          "A quote that lands a week later is often a job already lost. Serious clients compare, and the first to answer walks away with an edge.",
          "The answer is not to rush the work, it is to shorten the delay: reuse a base, pre-fill it, dictate it. The goal is to reply while the client is still warm.",
        ],
      },
      {
        heading: "2. Forgetting to follow up",
        body: [
          "A quote with no reply is not a refusal, it is usually an oversight, on both sides. Not following up means letting go of a job you had already half won.",
          "Simply tracking pending quotes, with a reminder, turns part of that silence into signed contracts.",
        ],
      },
      {
        heading: "3. Not tracking job site progress",
        body: [
          "Without tracking, you discover delays and overruns too late, once they are already costing you money. Flying blind is the surest way to eat into your margin without noticing.",
          "A clear, up-to-date dashboard lets you act before the problem takes root.",
        ],
      },
      {
        heading: "4. Confusing cash flow with profitability",
        body: [
          "Having money in the bank does not mean you are making money. Plenty of contractors mistake today's bank balance for the real health of their business.",
          "Tracking what is left to invoice and to collect, job site by job site, gives a far more reliable picture than the bank statement alone.",
        ],
      },
      {
        heading: "5. Keeping everything in your head",
        body: [
          "Memory is a poor management tool. What is not written down gets forgotten: a promise to a client, a detail on a job site, a deadline.",
          "Capturing information the moment it comes up, ideally by voice, prevents the kind of oversights that end up costing real money.",
        ],
      },
      {
        heading: "The last two mistakes to avoid",
        body: [
          "Two quieter mistakes round out the list, and they mostly hit companies that are growing.",
        ],
        list: [
          "6. Pushing admin work to the evening, until you burn out",
          "7. Piling up tools that do not talk to each other",
        ],
      },
      {
        heading: "What all these mistakes have in common",
        body: [
          "These seven mistakes share a single root: a lack of visibility, and friction. When taking action requires too much effort, you put it off, and the leaks settle in.",
          "Cutting that friction, centralizing your information and automating the repetitive work is enough to fix most of them. That is exactly what Biltia is for: making management simple enough that it actually gets done.",
        ],
      },
    ],
    takeaways: [
      "It is the small mistakes, repeated, not the big ones, that erode your margin.",
      "A slow quote or a forgotten follow-up is a job lost.",
      "Managing without tracking means finding out about problems too late.",
      "Cash flow and profitability are not the same thing.",
      "The common root is friction: reduce it and you fix most of these mistakes.",
    ],
    faq: [
      {
        q: "What is the costliest management mistake for a contractor?",
        a: "Usually slow quotes and no follow-up: those are jobs already within reach, lost for lack of responsiveness.",
      },
      {
        q: "Do you need to be good at management to avoid these mistakes?",
        a: "No. Most of them are fixed by reducing friction: centralize your information, reply fast and automate the repetitive work, without becoming a full-time manager.",
      },
      {
        q: "How do you know whether a job site is really profitable?",
        a: "By tracking, job site by job site, what is left to invoice and to collect, rather than relying on today's bank balance alone.",
      },
    ],
    cta: "Which quotes are still waiting for an answer, and which job sites are over budget this week?",
  },

  // 10 ───────────────────────────────────────────────────────────────────────
  "devis-facturation-plus-vite": {
    title: "Quotes and invoicing: how to go three times faster",
    description:
      "Your quote is your best salesperson. Here is how to produce quotes and invoices three times faster, without losing an ounce of quality.",
    category: "Productivity",
    keywords: [
      "fast construction quotes",
      "contractor invoicing",
      "write a quote fast",
      "quote productivity",
      "save time on invoicing",
    ],
    excerpt:
      "The first contractor to send a clean quote usually wins the job. Speed is a commercial advantage.",
    intro:
      "In construction, your quote is your best salesperson. Whoever replies fast, with a clear document, gets a head start. Yet plenty of contractors take days to send a quote, simply for lack of a method. Here is how to go three times faster, without sacrificing quality.",
    sections: [
      {
        heading: "Why speed is a commercial advantage",
        body: [
          "A client asking for a quote is in decision mode. The longer you take, the more their enthusiasm fades and the more time the competition has to get ahead of you.",
          "Replying fast signals that you are serious and available. For an equal offer, that is often what makes the difference.",
        ],
      },
      {
        heading: "Never start from a blank page",
        body: [
          "Rebuilding every quote from scratch is the number one cause of slowness. Your jobs look more alike than you think: reuse a similar quote as your starting point.",
          "A library of recurring line items, with their prices, lets you assemble a quote in minutes instead of an hour.",
        ],
      },
      {
        heading: "Let the data fill itself in",
        body: [
          "Retyping a client's details, a job site address, your rates: those are minutes lost on every single document. When that information lives in one place, it carries over automatically.",
          "You focus on what matters, the content of the quote, not on re-entering data.",
        ],
      },
      {
        heading: "Dictate the quote on site",
        body: [
          "The best moment to prepare a quote is right after the visit, while everything is fresh. By dictating the line items on the spot, you lose no detail.",
          "Back at the office, the quote is already half done. Often all that is left is to check it and send it.",
        ],
      },
      {
        heading: "Turn a quote into an invoice without re-entering anything",
        body: [
          "An accepted job should not force you to retype everything just to invoice it. The quote already holds the essentials: it just needs to be converted.",
          "Cutting that step down to a few seconds prevents copying errors and speeds up payment.",
        ],
      },
      {
        heading: "The Biltia method",
        body: [
          "With Biltia, you describe the quote in plain language, or dictate it, and the tool writes it, prices it and formats it, pulling in the data your company already has.",
          "The result is a clean document, ready to send, produced in a fraction of the usual time. Replying fast stops being an effort and becomes a reflex.",
        ],
      },
    ],
    takeaways: [
      "The first to send a clear quote usually wins the job: speed is a sales tool.",
      "Never start from scratch: reuse a similar quote and a library of line items.",
      "Centralized data carries over on its own and eliminates re-entry.",
      "Dictating line items on site keeps you from forgetting details.",
      "Turning a quote into an invoice without retyping speeds up payment.",
    ],
    faq: [
      {
        q: "How do you write a quote faster without cutting corners?",
        a: "By reusing an existing base, letting client data carry over automatically, and dictating the line items on site, while everything is still fresh.",
      },
      {
        q: "Can you turn a quote into an invoice without retyping everything?",
        a: "Yes, when the quote and the invoice share the same data. The conversion then takes a few seconds, with no copying errors.",
      },
      {
        q: "How does Biltia speed up quote creation?",
        a: "You describe or dictate the quote, and Biltia writes it, prices it and formats it, pulling in the data your company already has.",
      },
    ],
    cta: "Prepare a quote for installing 30 square meters of hardwood flooring for the Martin client, ready to send.",
  },

  // 11 ───────────────────────────────────────────────────────────────────────
  "biltia-logiciel-ia-btp": {
    title: "Biltia: the AI software for construction that handles the admin for you",
    description:
      "Biltia is AI software for construction: you describe what you need, it delivers the quote, the tracker or the answer. What it does, who it is for, how to start.",
    category: "Discovery",
    keywords: [
      "Biltia",
      "AI software construction",
      "artificial intelligence software building",
      "AI software for contractors",
      "AI construction management software",
    ],
    excerpt:
      "One place where you describe your problem, and AI delivers the solution: a document, an app, an answer or an automation.",
    intro:
      "Biltia is AI software built for tradespeople and construction companies. The principle fits in one sentence: instead of learning yet another piece of software, you describe what you need in plain language, by text or by voice, and Biltia produces the solution. Here is what it actually does, who it is built for, and how to get started without losing a week to it.",
    sections: [
      {
        heading: "Biltia in one sentence",
        body: [
          "Biltia is AI software for construction that starts from your problem, not from a menu. You open a single bar, you say what you need, and the tool handles the rest.",
          "Where conventional software forces you to pick a module and then configure it, Biltia understands the request and decides for itself how best to answer it. You are not operating software, you are handing over a task.",
        ],
      },
      {
        heading: "Why AI software changes the game in construction",
        body: [
          "Construction is a field job, not a desk job. The trouble with traditional software is that it demands time sitting at a screen, keying things in and navigating through sections. That is time a contractor does not have during the day, so it piles up in the evening.",
          "AI software flips the logic: it does the formatting, the calculating and the searching. You supply the intent in a few words, it supplies the finished result. The wall between the need and the action comes down almost entirely.",
        ],
      },
      {
        heading: "What Biltia can do",
        body: [
          "Behind the single bar, Biltia produces four kinds of solutions depending on what you ask for. You never have to specify which one, it works that out from your sentence.",
        ],
        list: [
          "A document: quote, invoice, letter, report, ready to send",
          "An app: job site tracking, time sheets, inventory, generated to fit your needs",
          "An answer: a question about your data gets a sourced answer",
          "An automation: a check or a file reconciliation done in one pass",
        ],
      },
      {
        heading: "Who Biltia is for",
        body: [
          "Biltia is aimed first at the solo tradesperson and the small construction company, the ones with no admin department, carrying the management on top of the craft. They are the ones who gain the most by handing off the paperwork.",
          "It also serves slightly larger outfits, with an office and several job sites running at once, that want one simple entry point for the whole team. Plumber, electrician, mason, carpenter, multi-trade renovation firm: the tool adapts to the trade because it is generated from your description, not from a fixed template.",
        ],
      },
      {
        heading: "How Biltia differs from conventional management software",
        body: [
          "An ERP or a construction management package is powerful, but heavy: weeks of setup, a training course, dozens of menus, and a design meant for the office. Plenty of contractors buy one, then go back to the spreadsheet for lack of time.",
          "Biltia removes that phase. There is nothing to configure: you describe, it generates. And because everything lives in your company's memory, every document and every tracker draws on your real data, with no re-entry.",
        ],
      },
      {
        heading: "How Biltia differs from a general-purpose AI",
        body: [
          "A general-purpose AI can write a text, but it knows nothing about your clients, your job sites or your prices. It starts from zero every time and hands you a text to copy out, not a tool connected to your business.",
          "Biltia is built for construction and plugged into your workspace. When you ask for a quote for a client, it already knows their details and their job sites. When you ask a question about your delays, it answers from your data. That is the difference between an assistant that talks and an assistant that acts.",
        ],
      },
      {
        heading: "How to get started without losing a week",
        body: [
          "The best way to judge Biltia is to try it on a real need, not on an abstract demo. You can start for free and hand it whatever task eats the most of your time: getting a quote out, generating a job site tracker, or asking a question about your business.",
          "In practice, you describe what you want, Biltia asks a question or two if it needs to frame things, then it delivers. Build the reflex on one task, then expand from there. Within a few days, the single bar replaces several of your scattered tools.",
        ],
      },
    ],
    takeaways: [
      "Biltia is AI software for construction: you describe, it delivers the solution.",
      "Four formats covered: document, app, answer and automation.",
      "Built first for the solo tradesperson and the small company, with no admin department.",
      "Zero setup, unlike a conventional construction ERP.",
      "Built for construction and plugged into your data, unlike a general-purpose AI.",
      "Start for free on a real need, then expand.",
    ],
    faq: [
      {
        q: "What exactly is Biltia?",
        a: "Biltia is AI software for construction. You describe what you need in plain language, by text or by voice, and the tool produces a document, a business app, an answer based on your data or an automation, all from a single bar.",
      },
      {
        q: "Is Biltia suitable for a solo tradesperson?",
        a: "Yes, that is its primary audience. Small outfits with no admin department are the ones who save the most time by handing quotes, tracking and follow-ups to AI software.",
      },
      {
        q: "How is it different from a general-purpose AI like a chatbot?",
        a: "A general-purpose AI does not know your clients or your job sites, and hands you a text to copy out. Biltia is built for construction and connected to your company's memory, so it pre-fills your documents and answers from your real data.",
      },
      {
        q: "Do you have to configure Biltia before using it?",
        a: "No. There is no setup phase like there is with an ERP. You describe what you want and the tool generates it, then you adjust it by voice if you need to.",
      },
    ],
    cta: "Show me what you can do for my company: prepare a quote and a tracker for my job sites.",
  },

  // 12 ───────────────────────────────────────────────────────────────────────
  "chatgpt-artisan-btp": {
    title: "ChatGPT for construction tradespeople: what it does well, its limits, and the alternative",
    description:
      "ChatGPT can help a contractor write, but it knows nothing about your clients, prices or job sites. What it does well, where it stalls, and the construction alternative.",
    category: "Guide",
    keywords: [
      "ChatGPT for contractors",
      "ChatGPT construction",
      "ChatGPT construction quote",
      "generative AI for tradespeople",
      "ChatGPT for the building trade",
    ],
    excerpt:
      "ChatGPT writes well, but it does not know your company. Here is where it genuinely helps a contractor, and where it stops.",
    intro:
      "More and more tradespeople open ChatGPT to draft a quote, an email or a report. That is a good instinct, but you need to know where the tool helps and where it stalls. ChatGPT is an excellent general-purpose writer, not construction management software. Here, with no sugarcoating, is what it does well for a contractor, where its limits are, and the alternative built for construction.",
    sections: [
      {
        heading: "Why tradespeople turn to ChatGPT",
        body: [
          "The reason is simple: it is free to try, instant, and it writes better than a blank page. For a contractor who hates writing, getting clean text in seconds is a real relief.",
          "ChatGPT has become many professionals' first contact with AI. The problem is that they then ask it for things it was never designed to do, and hit a wall.",
        ],
      },
      {
        heading: "What ChatGPT does well for a contractor",
        body: [
          "On pure writing and general thinking tasks, ChatGPT genuinely delivers. As long as the task does not depend on your specific data, it is effective.",
        ],
        list: [
          "Rephrasing a delicate client email or a polite payment reminder",
          "Structuring a report from scattered notes",
          "Explaining a technical or administrative term",
          "Providing a template for a letter or terms and conditions",
          "Translating an exchange with a foreign client",
        ],
      },
      {
        heading: "Where ChatGPT stalls",
        body: [
          "The wall shows up as soon as the task touches your company. ChatGPT knows nothing about your clients, your prices or the progress of your job sites. So it cannot price a quote accurately, or tell you who owes you money.",
          "Another limit: it hands you text, not a tool. You have to copy it out, reformat it, file the result somewhere. And it keeps no reliable memory of your business from one session to the next, so you repeat the context every time.",
        ],
        list: [
          "It knows nothing about your clients, your rates or your job sites",
          "It hands you text to copy out, not a filed document or an app",
          "It does not track your data over time",
          "It can invent a figure that looks plausible but is wrong",
        ],
      },
      {
        heading: "Take the quote as an example",
        body: [
          "Ask ChatGPT for a quote: it will hand you a nice template, but with made-up prices and a fictional client. It is up to you to correct everything, to put back your rates, your details, your layout.",
          "So the real time saved is limited. You start from a slightly less blank page, but the bulk of the work, tying the quote to a real client and real prices, still sits on your shoulders.",
        ],
      },
      {
        heading: "The real difference: a tool that knows your company",
        body: [
          "What a general-purpose AI lacks is a memory of your business. A tool that is genuinely useful to a contractor has to know who your clients are, what job sites you have and what prices you charge, in order to produce a result that is accurate and ready to use.",
          "That is exactly what Biltia does. You describe the quote, and it prices it from your real data, with the right client and your own rates, ready to send. It does not just write, it produces a document filed in your company's memory.",
        ],
      },
      {
        heading: "Beyond text: documents, apps, answers",
        body: [
          "Where ChatGPT stops at the conversation, a specialized tool goes all the way to the finished solution. With Biltia, the same bar produces a quote ready to sign, generates a custom job site tracker, or answers a question about your data.",
          "You never leave the tool to file or copy anything out. The result lives where your clients and your documents are, and it gets reused next time.",
        ],
      },
      {
        heading: "Should you drop ChatGPT?",
        body: [
          "Not at all. ChatGPT remains a good companion for thinking, rephrasing or explaining. Keep it for the general-purpose uses where it excels.",
          "But for anything involving your clients, your quotes, your job sites and your management, a specialized tool connected to your data will save you far more time. The best approach is often to use both, each in its place.",
        ],
      },
    ],
    takeaways: [
      "ChatGPT is an excellent general-purpose writer, not construction management software.",
      "It helps you rephrase, structure and explain, as long as the task does not depend on your data.",
      "It knows nothing about your clients, your prices or your job sites, and it can invent a wrong figure.",
      "It hands you text to copy out, not a filed document or an app.",
      "A construction tool connected to your data produces a result that is accurate and ready to use.",
      "The right instinct: ChatGPT to think, a specialized tool to act on your business.",
    ],
    faq: [
      {
        q: "Can you write a quote with ChatGPT?",
        a: "ChatGPT can produce a quote template, but with made-up prices and a fictional client, because it knows nothing about your data. You then have to correct everything. A tool connected to your rates and your clients prices the quote accurately, ready to send.",
      },
      {
        q: "Does ChatGPT know my clients and my job sites?",
        a: "No. ChatGPT has no access to your business and keeps no reliable memory of it from one session to the next. You have to repeat the context every time.",
      },
      {
        q: "What is the alternative to ChatGPT for a construction tradesperson?",
        a: "A specialized construction tool connected to your data, such as Biltia. You describe what you need and it produces the document, the app or the answer from your real clients, prices and job sites.",
      },
      {
        q: "Should you stop using ChatGPT?",
        a: "No. ChatGPT is still useful for rephrasing, structuring or explaining. Keep it for those general-purpose uses, and hand anything involving your clients, quotes and job sites to a specialized tool.",
      },
    ],
    cta: "Prepare a priced quote for my client Martin based on my rates, ready to send.",
  },
};
