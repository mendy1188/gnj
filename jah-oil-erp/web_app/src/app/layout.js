import "./app.css";

export const metadata = {
  title: "JAH MULTI INDUSTRIES",
  description: "Integrated Operations Platform",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fira+Code&family=Inter:opsz,wght@14..32,100..900&family=Poppins:wght@300;400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={"bg-[#FAFAFB] font-[Inter] text-sm text-[#56565C]"}>
        {children}
      </body>
    </html>
  );
}
