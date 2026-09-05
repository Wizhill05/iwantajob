import type { Metadata } from 'next';
import { Inter, Manrope, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { ActivityProvider } from '@/context/ActivityContext';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Job Ingestion & Parsing Platform',
  description: 'Autonomous Job Discovery & Aggregation Platform Cockpit',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} ${robotoMono.variable} dark`}
    >
      <body className="bg-[#131313] text-[#f3f4f6] font-sans antialiased min-h-screen selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e]">
        <ActivityProvider>
          <div className="min-h-screen bg-[#131313] flex">
            {/* Desktop Left Fixed Sidebar */}
            <DesktopSidebar />

            {/* Main Content Area without Top Header */}
            <div className="flex-1 lg:pl-64 flex flex-col min-h-screen min-w-0">
              <main className="flex-1 pb-24 lg:pb-12 px-4 lg:px-8 max-w-7xl w-full mx-auto">
                {children}
              </main>
            </div>

            {/* Mobile iOS Style Bottom Floating Dock */}
            <MobileBottomNav />
          </div>
        </ActivityProvider>
      </body>
    </html>
  );
}
