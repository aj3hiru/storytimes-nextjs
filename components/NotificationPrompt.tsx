"use client";

import { usePathname } from "next/navigation";
import { isNotificationPage } from "@/lib/notification-pages";

const MODAL_MARKUP = `<div class="modal fade" id="modalCookie1" tabindex="-1" role="dialog" aria-hidden="true"><div class="modal-dialog modal-frame modal-top modal-notify modal-info" role="document"><div class="modal-content"><div class="modal-body"><div class="modal-body-icon"><img alt="notification icon" src=""></div><div class="modal-body-message">We'd like to show you notifications for the latest news and updates.</div><div class="clearfix"></div></div><div class="modal-footer"><button type="button" class="btn btn-primary" data-dismiss="modal" onclick="if (typeof subscribeTokenToTopic === 'function') { subscribeTokenToTopic(); }">Allow</button><button type="button" class="btn btn-secondary" data-dismiss="modal">Later</button></div></div></div></div>`;

export default function NotificationPrompt() {
  const pathname = usePathname();
  if (!isNotificationPage(pathname)) return null;
  return <div dangerouslySetInnerHTML={{ __html: MODAL_MARKUP }} />;
}
