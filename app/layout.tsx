import type { Metadata, Viewport } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: 'Chasing Sachin — 100 international centuries on a globe',
  description: 'Every international century Sachin Tendulkar ever scored. On a rotating globe. Watch 23 years of cricket history accumulate.',
  openGraph: {
    type: 'website',
    title: 'Chasing Sachin — 100 international centuries',
    description: 'Every international century Sachin ever scored. On a rotating globe.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chasing Sachin — 100 international centuries',
    description: 'Every international century Sachin ever scored. On a rotating globe.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#060a18',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased bg-[#060a18]">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
