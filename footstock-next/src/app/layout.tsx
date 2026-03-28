import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { DevOverlayProvider } from "@/components/dev/DevOverlayProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Foot Stock — O Mercado do Futebol Brasileiro",
  description:
    "Simule investimentos em clubes de futebol brasileiros com moeda virtual educacional. Compre e venda ações de 40 clubes da Série A e Série B.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Foot Stock",
    description: "O mercado do futebol brasileiro",
    images: ["/images/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: false,
  themeColor: "#080808",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      style={{ colorScheme: "dark" }}
      className={`${inter.variable} ${playfair.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh bg-[#080808] text-[#f0ead6] antialiased">
        {children}
        {process.env.NODE_ENV === "development" && <DevOverlayProvider />}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#141210",
              border: "1px solid rgba(201,168,76,.18)",
              color: "#f0ead6",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
