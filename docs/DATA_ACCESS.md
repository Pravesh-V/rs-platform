# Data access and integration register

Updated 26 September 2026. This records integration status and permission prerequisites; it is not evidence that accounts are connected.

| Data source | Current status | Needed before activation |
|---|---|---|
| Owner-supplied Reddit CSV | Import UI/code implemented; DB test pending | Owner’s permission to provide, store, process, and report the records; source note; retention terms. |
| Reddit Data API or commercial supplier | Disconnected | Written approval/agreement for commercial use and specific collection/processing, credentials, rate and retention terms. [Reddit policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy). |
| Reddit account insights | Disconnected | Supported account access or authorized owner export. Product-visible counters do not establish API availability. |
| OpenAI web-search API | Disconnected | Application API account, key kept server-side, model/tool compatibility, data-processing permission, cost cap. [Docs](https://developers.openai.com/api/docs/guides/tools-web-search). |
| Gemini / Perplexity answers | Disconnected | Separate adapter and provider-specific terms, credentials, citation and cost validation. |
| GA4 | Disconnected | Client-approved property, read-only OAuth, exact property selection, source timezone, quota and sampling/threshold notes. [Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/basics). |
| Search Console | Disconnected | Client-approved verified property, read-only OAuth or export, report-specific coverage. Third-party Reddit URLs require another source. |
| SERP provider | Disconnected | Licensed access, locale/depth rules, costs, retention rights, observed-result semantics. |
| Notifications | Disconnected | Opt-in recipients and separate send authorization. |

All missing integrations must remain visibly disconnected. An import is not a permission bypass. Do not mix client secrets, data, or AI drafting context between tenants. Raw source retention and deletion must follow the permission attached to each source.
