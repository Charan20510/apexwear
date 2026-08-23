import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import Landing from "./landing/Landing.jsx";
import WishlistPage from "./landing/components/WishlistPage.jsx";
import CartPage from "./landing/components/CartPage.jsx";
import InfoPage from "./landing/components/InfoPage.jsx";

function App() {
  return (
    <Routes>
      {/* The landing page brings its own Nav and Footer, so it sits outside Layout. */}
      <Route path="/" element={<Landing />} />
      <Route path="/mywishlist" element={<WishlistPage />} />
      <Route path="/cart" element={<CartPage />} />
      {/* Old path kept so existing links and bookmarks don't dead-end. */}
      <Route path="/wishlist" element={<Navigate to="/mywishlist" replace />} />

      <Route element={<Layout />}>
        <Route path="/shop" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* Catches the footer's info links (About, Returns, Size guide, …) and doubles
          as the 404: React Router ranks the static routes above, so an unknown path
          only reaches here and InfoPage renders its "not found" branch. */}
      <Route path="/:slug" element={<InfoPage />} />
    </Routes>
  );
}

export default App;
