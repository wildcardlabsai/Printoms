import { CopyField } from "./copy-field";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-ink-2">{children}</div>
    </li>
  );
}

const code = "rounded bg-subtle px-1 py-px font-mono text-[12px] text-ink ring-1 ring-line";

export function EtsySetupGuide({ redirectUri }: { redirectUri: string }) {
  return (
    <ol className="space-y-4">
      <Step n={1}>
        Sign in at <a className="font-medium text-brand-700 hover:underline" href="https://www.etsy.com/developers/your-apps" target="_blank" rel="noopener noreferrer">etsy.com/developers/your-apps</a> with the account that owns your shop and choose <strong>Create a New App</strong>. Describe it as a private order-management tool for your own shop.
      </Step>
      <Step n={2}>
        Once Etsy approves the app, copy the <strong>Keystring</strong> and <strong>Shared secret</strong> into <span className={code}>ETSY_API_KEYSTRING</span> and <span className={code}>ETSY_SHARED_SECRET</span>.
      </Step>
      <Step n={3}>
        Under the app’s callback URLs add exactly:
        <CopyField value={redirectUri} />
        and set <span className={code}>ETSY_REDIRECT_URI</span> to the same value.
      </Step>
      <Step n={4}>
        Redeploy, then click <strong>Connect Etsy</strong>. You’ll approve these scopes on Etsy: <span className={code}>transactions_r transactions_w listings_r shops_r email_r</span>. Tokens are stored encrypted and refreshed automatically.
      </Step>
      <Step n={5}>
        The first sync imports receipts updated in the chosen initial window. Orders already marked shipped on Etsy are imported as completed so they don’t flood the production board.
      </Step>
    </ol>
  );
}

export function ShopifySetupGuide({ redirectUri, store }: { redirectUri: string; store: string | null }) {
  return (
    <ol className="space-y-4">
      <Step n={1}>
        In the <a className="font-medium text-brand-700 hover:underline" href="https://dev.shopify.com/dashboard" target="_blank" rel="noopener noreferrer">Shopify Dev Dashboard</a>, create an app for your store. Set <span className={code}>SHOPIFY_STORE_DOMAIN</span> to your <span className={code}>your-store.myshopify.com</span> domain{store ? <> (currently <span className={code}>{store}</span>)</> : null}.
      </Step>
      <Step n={2}>
        Configure Admin API access scopes: <span className={code}>read_orders, read_customers, read_products, read_fulfillments, write_fulfillments, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders</span>.
      </Step>
      <Step n={3}>
        Under <strong>Protected customer data</strong>, request access to customer name, email and address — Shopify withholds this data from apps without it.
      </Step>
      <Step n={4}>
        Add this allowed redirect URL:
        <CopyField value={redirectUri} />
        then copy the app’s <strong>Client ID</strong> and <strong>Client secret</strong> into <span className={code}>SHOPIFY_CLIENT_ID</span> and <span className={code}>SHOPIFY_CLIENT_SECRET</span>.
      </Step>
      <Step n={5}>
        Redeploy and click <strong>Connect Shopify</strong> to install the app on your store. If you already have an Admin API access token from a legacy custom app, you can set <span className={code}>SHOPIFY_ADMIN_ACCESS_TOKEN</span> instead and skip OAuth.
      </Step>
    </ol>
  );
}
