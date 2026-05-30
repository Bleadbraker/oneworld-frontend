import './globals.css';

export const metadata = {
  title: 'One World Tracker',
  description: 'Live Data Center Migration Tracking',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#050505] text-white" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}