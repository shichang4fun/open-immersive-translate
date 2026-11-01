import { useEffect, useState } from "preact/hooks";
import type { ServiceConfig } from "../../shared/types";
import { isIOSBuild } from "../../shared/platform";
import {
  hasProviderConsent,
  providerReceiver,
  setProviderConsent,
} from "../../shared/provider-consent";

export function ProviderConsent({
  serviceId,
  service,
}: {
  serviceId: string;
  service?: ServiceConfig;
}) {
  const [allowed, setAllowed] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const receiver = providerReceiver(serviceId, service);
  const chinese = navigator.language.startsWith("zh");
  useEffect(() => {
    if (!isIOSBuild()) return;
    let active = true;
    setAllowed(undefined);
    setError(false);
    void hasProviderConsent(serviceId, service)
      .then((value) => {
        if (active) setAllowed(value);
      })
      .catch(() => {
        if (active) {
          setAllowed(false);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [serviceId, receiver]);
  if (!isIOSBuild()) return null;
  const change = async (value: boolean) => {
    setBusy(true);
    setError(false);
    try {
      await setProviderConsent(serviceId, service, value);
      setAllowed(value);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      class="ui-card provider-consent"
      aria-label={chinese ? "第三方文本处理授权" : "Text sharing permission"}
    >
      <strong>{chinese ? "文本发送给谁" : "Where your text goes"}</strong>
      <p>{receiver}</p>
      {!allowed && (
        <p>
          {chinese
            ? "翻译会将待翻译文本及必要网页上下文（如标题、摘要）发送给此服务，内容可能包含个人信息。启用自动翻译后，也会按你的站点规则发送。服务商按其隐私政策处理数据；开发者不接收这些内容。"
            : "Translation sends source text and necessary page context (such as title and summary) to this service. Text may include personal information. Automatic translation also sends content according to your site rules. The provider handles it under its privacy policy; the app developer does not receive it."}
        </p>
      )}
      <button
        type="button"
        class={`ui-button ui-button-${allowed ? "secondary" : "primary"}`}
        disabled={busy || allowed === undefined}
        onClick={() => void change(!allowed)}
      >
        {allowed
          ? chinese
            ? "撤销此服务授权"
            : "Revoke permission"
          : chinese
            ? "允许向此服务发送文本"
            : "Allow text sharing with this service"}
      </button>
      {error && (
        <p role="alert">
          {chinese
            ? "授权保存失败，请重试。"
            : "Could not save permission. Please try again."}
        </p>
      )}
      <p>
        <a
          href="https://github.com/shichang4fun/open-immersive-translate/blob/main/docs/PRIVACY.md"
          target="_blank"
          rel="noreferrer"
        >
          {chinese ? "隐私政策" : "Privacy policy"}
        </a>
      </p>
    </section>
  );
}
