import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import Landing from "./landing/Landing.jsx";
import WishlistPage from "./landing/components/WishlistPage.jsx";

function App() {
  return (
    <Routes>
      {/* The landing page brings its own Nav and Footer, so it sits outside Layout. */}
      <Route path="/" element={<Landing />} />
      <Route path="/wishlist" element={<WishlistPage />} />

      <Route element={<Layout />}>
        <Route path="/shop" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
    </Routes>
  );
}

export default App;
