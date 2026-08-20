import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Ordres de mission — PORTEO GROUP';

export const metadata: Metadata = {
  title: { default: appName, template: `%s — ${appName}` },
  description:
    "Dématérialisation des ordres de mission en Côte d'Ivoire — PORTEO GROUP, Abidjan-Marcory.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1B2A4A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-background font-sans antialiased">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
