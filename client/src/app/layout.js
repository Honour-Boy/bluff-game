import './globals.css';

export const metadata = {
  title: 'BLUFF - Real-Time Multiplayer Card Game',
  description:
    'Challenge your friends in BLUFF — a fast-paced real-time multiplayer card game of deception, strategy, and nerve. Play, bluff, and survive.',

  icons: {
    icon: '/images/favicon.png',
    shortcut: '/images/favicon.png',
    apple: '/images/favicon.png',
  },

  openGraph: {
    title: 'BLUFF — Bluff, Bet, Survive',
    description:
      'Outwit your opponents in this real-time multiplayer bluffing game. Play with friends, call bluffs, and survive every round.',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    siteName: 'BLUFF',
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/images/og-preview.png`,
        width: 1200,
        height: 630,
        alt: 'BLUFF - Real-Time Multiplayer Card Game Preview',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  // Keep minimal Twitter (optional but harmless)
  twitter: {
    card: 'summary_large_image',
    title: 'BLUFF — Bluff, Bet, Survive',
    description:
      'A real-time multiplayer card game where strategy meets deception.',
    images: ['/images/og-preview.png'],
  },
};