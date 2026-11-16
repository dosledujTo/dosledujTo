import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage, RequireAdmin, RequireRole, SessionExpiredModal } from "./auth.jsx";
import { Layout } from "./layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Cases from "./pages/Cases.jsx";
import CaseDetail from "./pages/CaseDetail.jsx";
import Proceedings from "./pages/Proceedings.jsx";
import { ArticleDetail, ArticleQueue } from "./pages/Articles.jsx";
import { SuggestionDetail, SuggestionQueue } from "./pages/Suggestions.jsx";
import { OrgDetail, Orgs, PersonDetail, Persons } from "./pages/Entities.jsx";
import { Feeds, MyProfile, Revisions, UserDetail, Users } from "./pages/Operations.jsx";
import { Codelists } from "./pages/Codelists.jsx";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <RequireAdmin>
              <Layout />
            </RequireAdmin>
          }
        >
          <Route index element={<Dashboard />} />

          <Route path="kauzy" element={<Cases />} />
          {/* Každý tab detailu má vlastnú URL (zadanie §5.2). */}
          <Route path="kauzy/:id" element={<CaseDetail />} />
          <Route path="kauzy/:id/:tab" element={<CaseDetail />} />

          <Route path="konania" element={<Proceedings />} />

          <Route path="podnety" element={<SuggestionQueue />} />
          <Route path="podnety/:id" element={<SuggestionDetail />} />

          <Route path="clanky" element={<ArticleQueue />} />
          <Route path="clanky/:id" element={<ArticleDetail />} />

          <Route path="osoby" element={<Persons />} />
          <Route path="osoby/:id" element={<PersonDetail />} />
          <Route path="subjekty" element={<Orgs />} />
          <Route path="subjekty/:id" element={<OrgDetail />} />

          <Route path="profil" element={<MyProfile />} />

          <Route path="ciselniky" element={<RequireRole role="admin"><Codelists /></RequireRole>} />
          <Route path="pouzivatelia" element={<RequireRole role="admin"><Users /></RequireRole>} />
          <Route path="pouzivatelia/:id" element={<RequireRole role="admin"><UserDetail /></RequireRole>} />
          <Route path="administratori" element={<RequireRole role="admin"><Users adminsOnly /></RequireRole>} />
          <Route path="administratori/:id" element={<RequireRole role="admin"><UserDetail /></RequireRole>} />
          <Route path="feedy" element={<RequireRole role="admin"><Feeds /></RequireRole>} />
          <Route path="revizie" element={<RequireRole role="admin"><Revisions /></RequireRole>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

      <SessionExpiredModal />
    </>
  );
}
