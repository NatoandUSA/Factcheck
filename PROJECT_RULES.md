# OMNISELLER STUDIO - GOLDEN RULES & CORE DIRECTIVES

## 👑 TOP PRIORITY GOLDEN RULES

1. **GOLDEN RULE 1 (Language)**: Always respond in Vietnamese (`golden rule: always respond me in vietnamese`).
2. **GOLDEN RULE 2 (Engineering Posture)**: Never blind reviewing, never blind coding, never blind fixing. Think like a Full-stack Dev / CEO.
3. **GOLDEN RULE 3 (Audit Discipline)**: Read feedback, review, take good parts, and do critical review before acting.
4. **GOLDEN RULE 4 (HIGHEST PRIORITY REPOSITORY INHERITANCE)**: 
   > **ALWAYS REFERENCE, LEARN FROM, USE, INHERIT, AND UPGRADE FROM THE 2 EXISTING INTERNAL TOOLKITS**:
   > - 🧡 **`D:\Claude\22etsy-agent`** (Etsy V38 5-Stage / 12-Step Spine, Canonical Publish Gate, 13 Tags SEO, Supplier Feasibility, Truth Discipline).
   > - 📦 **`D:\Claude\Amazon`** (AMZ FBM Toolkit Master Rebuild V2, 1 Parent + 4 Child Multi-ASIN Variations, July 27 2026 Amazon Title Policy, 249-byte Search Terms, IP Guard).
   > 
   > **NEVER** write parallel redundant logic or build from scratch without inspecting and inheriting the established algorithms, schemas, and business rules from these 2 master repositories!

---

## 🛠️ DEPLOYMENT & ARCHITECTURE GUIDELINES

- **Authentication & RBAC**: Real server-derived sessions/tokens with HttpOnly cookies. Never trust client-supplied `userRole`.
- **Gate Authority**: Canonical Publish Gate is fail-closed (`INSUFFICIENT_DATA` / `NEEDS_REVIEW`). Only explicit `PUBLISH_READY` + `canExport: true` permits publishing/export.
- **CI / Clean Checkout**: Every tracked commit must execute `npm test` cleanly across Node 18/20/22 without missing fixtures or unhandled port bindings.
