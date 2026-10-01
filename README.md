Téma leírása
A vállalati szoftverarchitektúrák napjainkban paradigmaváltáson mennek keresztül: a merev, determinisztikus SaaS és ERP integrációk helyét a dinamikus, ágens-alapú (Agentic) orkesztrációs munkafolyamatok veszik át. A modern LLM-ek és ágensek már nem csupán asszisztensi funkciókat látnak el, hanem teljes üzleti folyamatokat képesek önállóan koordinálni.
A vállalatok legnagyobb kihívása azonban a meglévő, heterogén legacy rendszereik (adatbázisok, REST/SOAP API-k, hagyományos BPEL/BPMN folyamatmotorok) biztonságos és hatékony bevonása ebbe az új ökoszisztémába. A modernizáció kulcsa a Model Context Protocol (MCP), amely standard interfészként („USB-portként”) elrejti az alrendszerek komplexitását az ágensek elől, valamint a digitális tranzakciókat és kereskedelmi folyamatokat szabványosító Google Universal Commerce Protocol (UCP).
A hallgató feladatai lépésről lépésre:
A mock legacy vállalati infrastruktúra gyors prototipizálása („vibe coding”):
Egy működő, realisztikus vállalati mikrokörnyezet felépítése generatív AI eszközökkel (pl. Cursor, Claude Code, GitHub Copilot).
Alrendszerek létrehozása:
Adatbázisok és alapvető entitások (termékkatalógus, raktárkészlet, rendelések, partnerek).
API végpontok és hagyományos üzleti logikát / folyamatokat leíró engine (pl. BPEL/BPMN munkafolyamat motor).
Modulok lefedése: raktárkezelés/logisztika, számlázás és könyvelési modulok, valamint külső fizetési integráció szimulációja (pl. Stripe API).
Ágens-alapú refaktorálás és MCP Server réteg kialakítása:
Standardizált MCP (Model Context Protocol) szerverek megtervezése és implementálása a legacy komponensek fölé, amelyek elrejtik a nyers API-kat és közvetlen DB hozzáféréseket.
Specializált képességekkel (Skills) felruházott ágensek konfigurálása, amelyek természetes nyelven (pl. chatbottal történő rendelésleadás, státuszlekérdezés, hibakezelés) vezérlik a vállalati folyamatokat.
AI Tokenomics mérés és optimalizáció: token-költség és válaszidő monitorozása a végrehajtási ciklusok során.
Google Universal Commerce Protocol (UCP) integráció:
A rendszer felkészítése és összekötése az UCP szabvánnyal, megvalósítva az autonóm, platformfüggetlen kereskedelmi és tranzakciós folyamatokat.
Transzformációs metodológia kidolgozása és dokumentálása:
Egy reprodukálható módszertani útmutató összeállítása arról, hogy hagyományos monolit / mikroszerviz alapú vállalati rendszereket milyen lépések mentén érdemes autonóm, MCP-alapú ágens architektúrára átállítani.