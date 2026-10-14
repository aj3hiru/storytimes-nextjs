"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { isNotificationPage } from "@/lib/notification-pages";

const NOTIFICATION_SCRIPT =
  "https://neworiginqa-static.clmbtech.com/c1e/static/notification_config/8359/27809/js/index.js";

export default function NotificationScripts() {
  const pathname = usePathname();
  if (!isNotificationPage(pathname)) return null;

  return (
    <>
      <Script src="https://code.jquery.com/jquery-3.7.1.min.js" strategy="afterInteractive" />
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js"
        strategy="afterInteractive"
      />
      {/* In-house notification code. Keep Firebase before the vendor client. */}
      <Script src="https://www.gstatic.com/firebasejs/7.6.0/firebase-app.js" strategy="afterInteractive" />
      <Script src="https://www.gstatic.com/firebasejs/7.6.0/firebase-messaging.js" strategy="afterInteractive" />
      <Script src="https://www.gstatic.com/firebasejs/7.6.0/firebase-analytics.js" strategy="afterInteractive" />
      <Script src={NOTIFICATION_SCRIPT} strategy="afterInteractive" />
    </>
  );
}
