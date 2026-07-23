import type { Metadata } from 'next';
import { Sora, Figtree } from 'next/font/google';
import { Toaster } from 'sonner';
import { Providers } from '@/lib/query-client';
import { noFlashScript } from '@/lib/theme';
import './globals.css';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora', weight: ['600', '700'] });
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Admin - Inspira POS',
  robots: { index: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={`${sora.variable} ${figtree.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="font-body antialiased">
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
