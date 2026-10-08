import React, { useState } from "react";
import axios from "axios";

function SignUp() {
  const [isLogin, setIsLogin] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const { email, username, password } = formData;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const endpoint = isLogin
      ? "http://localhost:3001/login"
      : "http://localhost:3001/signup";

    const payload = isLogin
      ? { email, password }
      : { email, username, password };

    try {
      const { data } = await axios.post(endpoint, payload, {
        withCredentials: true,
      });

      if (data.success) {
        setSuccessMessage(
          isLogin ? "Logged in successfully! Redirecting..." : "Account created successfully! Redirecting..."
        );
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
        }
        if (data.token) {
          localStorage.setItem("token", data.token);
        }

        setTimeout(() => {
          window.location.href = "http://localhost:3000";
        }, 1200);
      }
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message || "An error occurred. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row align-items-center justify-content-center my-4">
        {/* Left column: Zerodha Illustration */}
        <div className="col-lg-6 col-md-8 text-center mb-5 mb-lg-0">
          <img
            src="media/images/signup.png"
            alt="Zerodha Signup"
            className="img-fluid"
            style={{ maxHeight: "380px" }}
            onError={(e) => {
              // Fallback to homeHero image if signup.png is not present
              e.target.src = "media/images/homeHero.png";
            }}
          />
        </div>

        {/* Right column: Auth Card */}
        <div className="col-lg-5 col-md-8 col-sm-10">
          <div
            className="p-4 p-md-5 rounded shadow-sm bg-white border"
            style={{ borderColor: "#eee" }}
          >
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h3 className="fw-normal mb-0" style={{ color: "#424242" }}>
                {isLogin ? "Login to Kite" : "Open a free demat account"}
              </h3>
            </div>

            {errorMessage && (
              <div className="alert alert-danger py-2 small" role="alert">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="alert alert-success py-2 small" role="alert">
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {!isLogin && (
                <div className="mb-3">
                  <label
                    htmlFor="username"
                    className="form-label text-muted small fw-semibold"
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    className="form-control py-2"
                    placeholder="e.g. rahul_sharma"
                    value={username}
                    onChange={handleChange}
                    required={!isLogin}
                  />
                </div>
              )}

              <div className="mb-3">
                <label
                  htmlFor="email"
                  className="form-label text-muted small fw-semibold"
                >
                  Email address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  className="form-control py-2"
                  placeholder="name@example.com"
                  value={email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="mb-4">
                <label
                  htmlFor="password"
                  className="form-label text-muted small fw-semibold"
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  className="form-control py-2"
                  placeholder="Enter your password"
                  value={password}
                  onChange={handleChange}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn w-100 py-2 text-white fw-medium shadow-none"
                style={{ backgroundColor: "#387ed1", borderRadius: "3px" }}
                disabled={loading}
              >
                {loading ? "Processing..." : isLogin ? "Login" : "Sign Up"}
              </button>
            </form>

            <div className="text-center mt-4 pt-2 border-top">
              <span className="text-muted small">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button
                type="button"
                className="btn btn-link p-0 small text-decoration-none fw-semibold"
                style={{ color: "#387ed1" }}
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
              >
                {isLogin ? "Sign up now" : "Log in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignUp;