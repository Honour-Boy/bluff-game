import './globals.css';

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ),

  title: 'BLUFF - Real-Time Multiplayer Card Game',
  description:
    'Challenge your friends in BLUFF — a fast-paced real-time multiplayer card game of deception, strategy, and nerve.',

  icons: {
    icon: '/images/favicon.png',
    shortcut: '/images/favicon.png',
    apple: '/images/favicon.png',
  },

  openGraph: {
    title: 'BLUFF — Bluff, Bet, Survive',
    description:
      'Outwit your opponents in this real-time multiplayer bluffing game. Play with friends and survive every round.',
    url: '/',
    siteName: 'BLUFF',
    images: [
      {
        url: '/images/og-preview.png',
        width: 1200,
        height: 630,
        alt: 'BLUFF Preview',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
};