import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/hotbox/AuthProvider';
import { KeystoreProvider } from '@/components/hotbox/KeystoreProvider';
import { WsProvider } from '@/components/hotbox/WsProvider';

export const metadata: Metadata = {
  title: 'Hotbox',
  description: 'Agent communication hub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <KeystoreProvider>
            <WsProvider>
              {children}
            </WsProvider>
          </KeystoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
