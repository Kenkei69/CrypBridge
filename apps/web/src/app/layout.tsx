import type { Metadata } from 'next';
import './globals.css';
import { SimulationBanner } from '../components/SimulationBanner';

export const metadata: Metadata = {
  title: 'x402 Guardian | AI Purchasing Protection',
  description: 'Authoritative payment authorization, drain protection, and security boundaries for AI-assisted purchases.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-gray-100 antialiased selection:bg-blue-600 selection:text-white">
        <SimulationBanner />
        {children}
      </body>
    </html>
  );
}
