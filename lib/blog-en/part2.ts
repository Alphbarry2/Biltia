// ─────────────────────────────────────────────────────────────────────────────
// BLOG EN — partie 2 (articles 5 à 8 de la source FR lib/blog.ts).
// Seul le TEXTE est traduit ; slug, date, updated, readingMinutes et
// relatedProduct restent partagés avec la source française.
// ─────────────────────────────────────────────────────────────────────────────

import type { BlogPostEn } from "@/lib/blog-i18n";

export const BLOG_EN_2: Record<string, BlogPostEn> = {
  // 5 ───────────────────────────────────────────────────────────────────────
  "gagner-temps-administratif-btp": {
    title: "10 ways to win back an hour a day on construction paperwork",
    description:
      "Is paperwork eating your evenings? Here are 10 concrete ways to win back an hour a day and give it back to the job site.",
    category: "Tips",
    keywords: [
      "save time on paperwork",
      "construction admin work",
      "contractor organization",
      "construction productivity",
      "job site management tips",
    ],
    excerpt:
      "Paperwork usually happens at night, on top of a full day. Here is how to win that lost hour back.",
    intro:
      "For many tradespeople, paperwork happens in the evening, after an already full day. It is the fastest route to burnout and to putting off the things that actually matter. Here are ten concrete habits that give you back an hour a day, without turning your whole organization upside down.",
    sections: [
      {
        heading: "1. Handle it right away, on the job site",
        body: [
          "A customer request, a change order, a reminder: the longer you wait, the more details you lose. Handling the task on the spot, by voice, kills the evening pile before it forms.",
          "One minute on the job site is often worth ten minutes at night, when you first have to rebuild the whole context in your head.",
        ],
      },
      {
        heading: "2. Stop starting from a blank page",
        body: [
          "Rebuilding every quote or site report from scratch is wasted time. Reuse your previous documents as a base, or let a tool pre-fill them with your own data.",
        ],
      },
      {
        heading: "3. Centralize instead of scattering",
        body: [
          "A quote in a folder, a contact in your phone, a photo in your camera roll: scattered information burns an enormous amount of time. Bringing customers, job sites and documents together in one place changes everything.",
        ],
      },
      {
        heading: "4. Dictate instead of typing",
        body: [
          "You speak three times faster than you type, especially on a phone with beat-up fingers. Voice dictation is one of the biggest time savings available today.",
        ],
      },
      {
        heading: "5. Automate the repetitive tasks",
        body: [
          "Checking prices, matching delivery slips, following up on a quote: these tasks look the same every single time. Whatever repeats can be handed off to a tool, once and for all.",
        ],
      },
      {
        heading: "Five more habits that make the difference",
        body: [
          "Beyond the first five, a handful of simple habits free up the rest of the time you are looking for each week.",
        ],
        list: [
          "6. Block one short fixed slot instead of nibbling at it all day",
          "7. Answer in one sentence, not in an essay",
          "8. Digitize a document the moment it arrives, not later",
          "9. Ask your data a question instead of digging through it",
          "10. Let the alerts come to you instead of monitoring everything",
        ],
      },
      {
        heading: "The common thread: less friction",
        body: [
          "All of these habits share one goal: cutting the friction between the need and the action. Fewer steps, fewer tools, no re-entering the same information twice.",
          "That is exactly what Biltia is built for: a single bar where you describe what you want, and the solution shows up. Most of these ten habits then become automatic.",
        ],
      },
    ],
    takeaways: [
      "Evening paperwork mostly comes from postponed tasks: handle them on the spot.",
      "Never start from a blank page: reuse what exists and let it pre-fill.",
      "Centralizing customers, job sites and documents removes all the search time.",
      "Dictating and automating are the two biggest time-saving levers.",
      "The goal is to reduce the friction between the need and the action.",
    ],
    faq: [
      {
        q: "How much time can you really save on paperwork?",
        a: "Stacked together, these small optimizations make winning back an hour a day a realistic target for most tradespeople, without changing your trade or overhauling how you work.",
      },
      {
        q: "Where should you start to save time quickly?",
        a: "With dictation and handling things on the spot at the job site. Those two habits pay off fastest, because they eliminate the evening backlog entirely.",
      },
      {
        q: "Do you have to replace all your tools at once?",
        a: "No. The most effective move is to cut the number of steps and tools, centralizing gradually wherever you are losing the most time.",
      },
    ],
    cta: "Draft the site report for my day from these notes, ready to send to the customer.",
  },

  // 6 ───────────────────────────────────────────────────────────────────────
  "dicter-plutot-que-taper-btp": {
    title: "Dictate instead of typing: the habit that changes life on site",
    description:
      "You speak three times faster than you type. Here is why voice dictation is the single biggest time saver for a contractor.",
    category: "Tips",
    keywords: [
      "voice dictation construction",
      "speech recognition for contractors",
      "save time on the job site",
      "voice input",
      "field productivity",
    ],
    excerpt:
      "Hands full, fingers beat up, no time to type. Voice solves the problem.",
    intro:
      "On a job site, typing on a phone is a punishment: your hands are full, your fingers are wrecked, and the screen is covered in dust. Voice dictation completely changes your relationship with paperwork. Here is why it is the most profitable habit you can pick up.",
    sections: [
      {
        heading: "You speak three times faster than you type",
        body: [
          "On average, you dictate around 150 words per minute, against 40 when typing on a phone. The math is simple: voice cuts the time you spend entering a request by three.",
          "Across a day filled with small entries, that factor of three adds up to a serious amount of time handed back to the trade.",
        ],
      },
      {
        heading: "Capture the information at the right moment",
        body: [
          "The real gain is not only speed, it is timing. When you dictate on the job site, you capture the exact detail while it is still fresh.",
          "By evening, you have forgotten the measurements, the customer name, the exact part number. Dictating on the spot keeps the information accurate and complete.",
        ],
      },
      {
        heading: "Less friction, more action",
        body: [
          "Plenty of tasks never get done simply because typing is too painful. Voice removes that barrier: if asking takes five seconds, you actually do it.",
          "The result: site reports get written, requests go out, nothing piles up for the evening.",
        ],
      },
      {
        heading: "Dictating does not mean raw text",
        body: [
          "The point of a good tool is that it does not just transcribe. You dictate an intent, and it turns that into a structured document, a tracker or an answer.",
          "So you do not have to talk like a robot or phrase everything perfectly. You say it plainly, and the tool does the formatting.",
        ],
      },
      {
        heading: "Situations where voice wins every time",
        body: [
          "Some situations are made for dictation: the ones where your hands or your attention are already taken.",
        ],
        list: [
          "Up on scaffolding, or with your hands full",
          "Walking between two work stations",
          "Right after a conversation with a customer, so nothing gets lost",
          "In the van, parked, before you head off again",
        ],
      },
      {
        heading: "Dictation is at the heart of Biltia",
        body: [
          "Biltia was designed for voice. You press the mic, you describe what you need, and the tool produces the solution: a document, a tracker, an answer.",
          "That is what makes paperwork compatible with a real day on site: you no longer wait until the evening, you act in the moment, by voice.",
        ],
      },
    ],
    takeaways: [
      "You dictate roughly three times faster than you type on a phone.",
      "Dictating on the job site captures accurate information while it is still fresh.",
      "Voice removes the barrier that pushes tasks back to the evening.",
      "A good tool turns dictation into a structured document, not raw text.",
      "Biltia is built around dictation, so you can act without going back to the office.",
    ],
    faq: [
      {
        q: "Is voice dictation reliable on a noisy job site?",
        a: "Modern tools handle background noise well. Stepping aside for a moment or holding the phone closer is usually enough to get an accurate transcription.",
      },
      {
        q: "Do you have to speak in a particular way to dictate?",
        a: "No. You speak plainly, the way you would to a colleague. A good tool understands the intent and formats the result, without you having to phrase everything perfectly.",
      },
      {
        q: "Is dictation only useful for taking notes?",
        a: "No. With Biltia, dictation triggers a real solution: a document ready to send, a generated tracker or an answer drawn from your data, not just a note.",
      },
    ],
    cta: "I will dictate today's site report for the Dumont job, get it ready for the customer.",
  },

  // 7 ───────────────────────────────────────────────────────────────────────
  "creer-outil-metier-sans-code": {
    title: "Building your own business tool without coding: a contractor's guide",
    description:
      "Job tracking, time tracking, inventory: learn how to build your own business tool without a developer, simply by describing it.",
    category: "Guide",
    keywords: [
      "no-code business tool",
      "custom construction app",
      "no-code for contractors",
      "build a job site app",
      "custom construction software",
    ],
    excerpt:
      "No tool on the market fits the way you work? What if you built your own, without coding.",
    intro:
      "Every construction business has its own way of working, but software is built for everyone at once. The result: you bend your habits to fit the tool, or you give up on it. There is now another path: building your own business tool, with no developer, simply by describing it. Here is how.",
    sections: [
      {
        heading: "The problem with tools that never quite fit",
        body: [
          "You have almost certainly tried software that did nearly what you wanted, but not quite. One column too many, one field missing, a logic that is not yours.",
          "Compromise after compromise, the tool turns into a constraint. You end up working around it with a spreadsheet or a notepad, while the software you paid for gathers dust in a corner.",
        ],
      },
      {
        heading: "No-code, a first but imperfect answer",
        body: [
          "No-code tools opened the door: building your own application without writing code. That is real progress, but you still have to design everything yourself, think through the structure, connect the data.",
          "For a contractor with no spare time, that build phase is still a roadblock. You want a tool, not a project to run.",
        ],
      },
      {
        heading: "The new approach: describe it instead of building it",
        body: [
          "The next step is generating the tool from a plain description. You say what you need in everyday language, and the application appears, ready to use.",
          "For example: a time tracking sheet by worker and by job site, with overtime included. One sentence, and the tracker exists.",
        ],
      },
      {
        heading: "Change it by voice, without starting over",
        body: [
          "Needs always evolve. The beauty of a generated tool is that you can evolve it by simply speaking: add a column, an alert, a status, a signature.",
          "You are not reopening a configuration project, you state the change and it gets applied. The tool follows your business, not the other way around.",
        ],
      },
      {
        heading: "Real examples you can generate today",
        body: [
          "Plenty of everyday needs are a perfect fit for a custom generated tool.",
        ],
        list: [
          "Job site tracking with progress and the balance left to invoice",
          "Time tracking by worker and by job site",
          "An equipment inventory with condition and next inspection date",
          "A simple schedule of the week's jobs",
          "A customer request tracker with statuses",
        ],
      },
      {
        heading: "Everything connected in a single space",
        body: [
          "An isolated tool is worth very little. The real power comes from your applications sharing the same customers, job sites and crews.",
          "With Biltia, every generated application draws on your company's memory. A time tracker knows your job sites, a tracker knows your customers. Nothing to re-enter.",
        ],
      },
    ],
    takeaways: [
      "Off-the-shelf software imposes its own logic, and you usually end up working around it.",
      "No-code helps, but it still asks you to design everything yourself.",
      "The new approach generates the tool from a plain description in everyday language.",
      "You evolve the application by voice, with no configuration phase.",
      "Generated applications share the same data as the rest of your business.",
    ],
    faq: [
      {
        q: "Do you need to know how to code to build your own business tool?",
        a: "No. With a description-based approach, you explain what you need in everyday language and the application is generated for you. No technical skills required.",
      },
      {
        q: "Can you change the tool once it has been created?",
        a: "Yes. You add a column, an alert or a status simply by asking for it, with no configuration step to go back through.",
      },
      {
        q: "Are these applications connected to my data?",
        a: "Yes. In Biltia, every application draws on your company's memory, so it already knows your customers, job sites and crews.",
      },
    ],
    cta: "Create a time tracking sheet by worker and by job site, including overtime.",
  },

  // 8 ───────────────────────────────────────────────────────────────────────
  "workspace-memoire-entreprise-btp": {
    title: "Company memory: when your data starts working for you",
    description:
      "Customers, job sites, documents, crews: here is why centralizing your data into a company memory changes everything, every day.",
    category: "Guide",
    keywords: [
      "company memory",
      "centralize construction data",
      "contractor workspace",
      "job site data",
      "construction information management",
    ],
    excerpt:
      "Your data is scattered between your phone, your van and your office. What if it worked together?",
    intro:
      "In many construction businesses, information is everywhere and nowhere: a quote in an email, a contact in a phone, a photo in a camera roll, a number scribbled in a notebook. That scattering costs time and causes mistakes. The answer is a single company memory. Here is why it changes everything.",
    sections: [
      {
        heading: "The real cost of scattered information",
        body: [
          "Hunting for a customer's number, digging up the last quote, trying to remember a detail from a job site: these small searches, repeated all day long, end up weighing a lot.",
          "Worse, scattered information leads to mistakes: an outdated price reused, a stale contact, a decision forgotten. Whatever is not centralized eventually gets lost.",
        ],
      },
      {
        heading: "What a company memory actually is",
        body: [
          "It is a single space where every element of your business lives, connected to the others: customers, job sites, documents, crews, applications and history.",
          "A customer is linked to their job sites, those job sites to their documents, those documents to their amounts. You are no longer opening isolated files, you are working with a coherent whole.",
        ],
      },
      {
        heading: "Documents that fill themselves in",
        body: [
          "When your data is connected, producing a document becomes instant. You ask for a quote for a customer, and their details, their job sites and their pricing are already there.",
          "No more re-entering the same information for every document. The memory does the work for you.",
        ],
      },
      {
        heading: "Answers instead of searches",
        body: [
          "With a company memory, you no longer open ten files to understand a situation. You ask the question and you get the answer.",
          "Which job sites are running late, where a quote stands, which customer still needs a follow-up: the information comes to you, sourced from your own data, without you having to go looking for it.",
        ],
      },
      {
        heading: "A tool that gets sharper over time",
        body: [
          "This is the key point: the more you use that memory, the more it knows about your business, and the more useful the tool becomes.",
          "Every request enriches the whole. After a few weeks, the tool knows your customers, your habits and your job sites, and anticipates what you need.",
        ],
      },
      {
        heading: "Security, the condition for trust",
        body: [
          "Centralizing your data means being able to count on how it is protected. A company memory is only worth something if it is strictly isolated and secured.",
          "In Biltia, each company's data is partitioned and protected. Your memory is yours, and it never mixes with anyone else's.",
        ],
      },
      {
        heading: "The Biltia workspace in practice",
        body: [
          "The workspace is the heart of Biltia. Everything you do, every document, every tracker, every answer, feeds it and feeds off it.",
          "That is what separates a simple generator from a real assistant: memory. Without it, every request starts from zero; with it, the tool grows alongside your business.",
        ],
      },
    ],
    takeaways: [
      "Scattered information costs time and causes mistakes.",
      "A company memory connects customers, job sites, documents and crews.",
      "Your documents fill themselves in and your questions get answers sourced from your data.",
      "The more the memory is fed, the sharper the tool becomes.",
      "Centralizing is only worth it if the data is isolated and secured.",
    ],
    faq: [
      {
        q: "What is a company memory in Biltia?",
        a: "It is the workspace: a single space where customers, job sites, documents, crews and history are connected to each other and reused by the tool.",
      },
      {
        q: "Is my data safe if I centralize it?",
        a: "In Biltia, each company's data is strictly isolated and protected. Your memory never mixes with another user's.",
      },
      {
        q: "Why does the tool get more useful over time?",
        a: "Because every request enriches the memory. The more the tool knows about your business, the better it pre-fills your documents and answers your questions.",
      },
    ],
    cta: "Show me the full history of the Villa Dumont job site: documents, amounts and next steps.",
  },
};
