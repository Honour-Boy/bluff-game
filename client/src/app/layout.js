import './globals.css';

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ),
  title: 'BLUFF - Real-Time Multiplayer Card Game',
  description:
    'Challenge your friends in BLUFF — a fast-paced real-time multiplayer card game of deception, strategy, and nerve.',

  // Favicon
  icons: {
    icon: '/images/logo.png',
    shortcut: '/images/logo.png',
    apple: '/images/logo.png',
  },

  // Open Graph metadata for social sharing (WhatsApp, Telegram, Facebook, LinkedIn, etc.)
  openGraph: {
    title: 'BLUFF',
    description: 'Real-Time Multiplayer Card Game',
    images: [
      {
        url: '/images/og-preview.png',
        width: 1200,
        height: 630,
        alt: 'BLUFF - Real-Time Multiplayer Card Game',
        type: 'image/png',
      },
    ],
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    type: 'website',
    siteName: 'BLUFF',
    locale: 'en_US',
  },

  // Twitter/X Card metadata
  twitter: {
    card: 'summary_large_image',
    title: 'BLUFF',
    description: 'Bluff, bet, and outwit your opponents',
    image: '/images/og-preview.png',
  },

  // Telegram support
  other: {
    'telegram:title': 'BLUFF',
    'telegram:description': 'Real-Time Multiplayer Card Game',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}