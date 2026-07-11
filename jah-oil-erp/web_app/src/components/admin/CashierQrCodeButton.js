"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

function buildPrintableMarkup({ svgMarkup, userName, branchName, qrCode }) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${userName} Cashier QR</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #0f172a;
            background: #fff;
          }
          .page {
            width: 100%;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 32px;
            box-sizing: border-box;
          }
          .card {
            width: 360px;
            border: 2px solid #e2e8f0;
            border-radius: 24px;
            padding: 24px;
            text-align: center;
          }
          .brand {
            font-size: 12px;
            letter-spacing: 0.24em;
            text-transform: uppercase;
            color: #64748b;
          }
          h1 {
            margin: 10px 0 4px;
            font-size: 24px;
          }
          p {
            margin: 0;
            color: #475569;
          }
          .qr {
            margin: 24px auto 18px;
            width: 220px;
            height: 220px;
          }
          .code {
            margin-top: 12px;
            font-size: 12px;
            color: #475569;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="card">
            <div class="brand">Jah Oil</div>
            <h1>${userName}</h1>
            <p>${branchName || "Cashier Badge"}</p>
            <div class="qr">${svgMarkup}</div>
            <div class="code">${qrCode}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export default function CashierQrCodeButton({
  userName,
  branchName,
  qrCode,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || svgMarkup || !qrCode) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    QRCode.toString(qrCode, {
      type: "svg",
      margin: 1,
      width: 240,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((nextSvgMarkup) => {
        if (!isMounted) {
          return;
        }

        setSvgMarkup(nextSvgMarkup);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, qrCode, svgMarkup]);

  if (!qrCode) {
    return null;
  }

  function handlePrint() {
    const popup = window.open("", "_blank", "width=600,height=800");

    if (!popup) {
      return;
    }

    popup.document.open();
    popup.document.write(
      buildPrintableMarkup({
        svgMarkup,
        userName,
        branchName,
        qrCode,
      }),
    );
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-2 cursor-pointer text-xs font-semibold text-sky-600 transition hover:text-sky-700"
      >
        Show QR code
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Cashier badge
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{userName}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {branchName || "Assigned cashier QR code"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="cursor-pointer rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-center">
              {isLoading ? (
                <div className="flex h-[260px] items-center justify-center text-sm text-slate-500">
                  Generating QR code...
                </div>
              ) : (
                <div
                  className="mx-auto flex min-h-[260px] items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />
              )}
              <p className="mt-3 text-xs font-medium text-slate-500">{qrCode}</p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handlePrint}
                disabled={!svgMarkup}
                className="cursor-pointer rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Print badge
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
