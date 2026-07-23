import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { noFlashScript } from '../lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inspira POS',
  robots: { index: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="antialiased">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
