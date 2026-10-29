import { z } from "zod";

export const defaultSiteContent = {
  themeDefault: "light" as const,
  hero: {
    greeting: "Hey, I'm Samuel Lakamo.",
    title: "Software Engineer",
    description: "Changing illusions into real-world solutions through code.\nUniversity student by day, innovative technical creator by night.",
    availability: "Available for hiring & freelance work",
    image: "/profile.png",
    imageAlt: "Portrait of Samuel Lakamo",
    cvPath: "/samuel-lakamo-cv.pdf",
    cvFilename: "Samuel-lakamo-cv.pdf",
    cvLabel: "Download CV",
    contactLabel: "Get in touch",
  },
  about: {
    title: "About",
    paragraphs: [
      "I’m passionate about building solid, scalable software products with exceptional user experiences, focusing on innovation, problem-solving, and turning ideas into practical solutions.",
      "I’m Samuel Lakamo, a self taught Nigerian programer and entrepreneur specializing in full-stack development and backend engineering with 3+ years of experience. I work with technologies such as JavaScript, TypeScript, React, Node.js, and PostgreSQL to build robust applications, scalable APIs, and reliable backend systems. My experience also includes working with Redis, BullMQ, Socket.IO, and AI integrations to develop real-time features and efficient, data-driven applications.",
      "I’m passionate about understanding how technology works under the hood, exploring backend architecture and cloud infrastructure, and continuously improving my engineering skills. My goal is to build meaningful products, solve real-world problems through technology, and contribute to innovations that create lasting value.",
    ],
    image: "/about-profile.png",
    imageAlt: "Samuel Lakamo",
  },
  skills: {
    title: "What I bring to the table…",
    intro: "Good software solves a real problem. I work across the whole stack, from the interface people touch to the systems that keep it running.",
    supportingText: "I help teams turn ideas into production-ready products. When I’m not coding, I’m reading developer articles and trying out new tools.",
    noteTitle: "My skillset includes:",
    learningTitle: "Continuous Learning",
    learningText: "I consistently explore new technologies and best practices. Currently diving deeper into cloud architecture, performance optimization, and contributing to open-source projects.",
    mainImage: "/skills-main.jpg",
    workImage: "/skills-clip.jpg",
    photoCaption: "Samuel L.",
    groups: [
      { group: "Frontend", items: ["React", "Next.js", "TypeScript", "Tailwind CSS"] },
      { group: "Backend", items: ["Node.js", "Express", "Socket.io"] },
      { group: "DB & Caching", items: ["PostgreSQL", "Drizzle ORM", "Redis", "BullMQ"] },
      { group: "Architecture", items: ["Distributed Systems"] },
      { group: "DevOps", items: ["Docker", "Docker Compose"] },
      { group: "Security", items: ["OAuth 2.0", "Paystack", "Flutterwave"] },
      { group: "AI", items: ["Gemini API", "Claude API"] },
    ],
  },
  contact: {
    formTitle: "Get in touch",
    heading: "How can I help?",
    tagline: "Let's turn your vision into something amazing.",
    body: "I'm always open to new opportunities, collaborations, or just swapping ideas. Send me a message, or email me if you'd like to see my CV or talk about a project.",
    email: "lakamosamuel7@gmail.com",
    phone: "2349132709107",
    whatsappUrl: "https://wa.me/2349132709107",
    telegramUrl: "https://t.me/+2349132709107",
    topics: ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "PostgreSQL", "Redis", "Docker"],
  },
  links: {
    github: "https://github.com/lakamo-samuel",
    linkedin: "https://www.linkedin.com/in/samuel-lakamo/",
    x: "https://x.com/_codeWithJoker",
  },
  footer: { copyright: "© MMXXVI · Samuel Lakamo · All rights reserved" },
};

const paragraph = z.string().min(1).max(4000);
export const siteContentSchema = z.object({
  themeDefault: z.enum(["light", "dark"]),
  hero: z.object({
    greeting: paragraph, title: paragraph, description: paragraph, availability: paragraph,
    image: z.string().min(1).max(500), imageAlt: z.string().max(300), cvPath: z.string().min(1).max(500),
    cvFilename: z.string().max(200), cvLabel: paragraph, contactLabel: paragraph,
  }),
  about: z.object({ title: paragraph, paragraphs: z.array(paragraph).min(1).max(12), image: z.string().min(1).max(500), imageAlt: z.string().max(300) }),
  skills: z.object({
    title: paragraph, intro: paragraph, supportingText: paragraph, noteTitle: paragraph, learningTitle: paragraph,
    learningText: paragraph, mainImage: z.string().min(1).max(500), workImage: z.string().min(1).max(500),
    photoCaption: paragraph, groups: z.array(z.object({ group: paragraph, items: z.array(paragraph).min(1).max(30) })).max(30),
  }),
  contact: z.object({
    formTitle: paragraph, heading: paragraph, tagline: paragraph, body: paragraph, email: z.string().email(), phone: z.string().max(40),
    whatsappUrl: z.string().url(), telegramUrl: z.string().url(), topics: z.array(paragraph).max(40),
  }),
  links: z.object({ github: z.string().url(), linkedin: z.string().url(), x: z.string().url() }),
  footer: z.object({ copyright: paragraph }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
