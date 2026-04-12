// Add logout button to Swagger UI
window.addEventListener('load', function() {
  // Wait for Swagger UI to fully render
  setTimeout(function() {
    const topbar = document.querySelector('.topbar');
    if (topbar && !document.getElementById('swagger-logout-btn')) {
      const logoutBtn = document.createElement('button');
      logoutBtn.id = 'swagger-logout-btn';
      logoutBtn.innerHTML = 'Logout';
      logoutBtn.style.cssText = `
        position: absolute;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        padding: 8px 16px;
        background: #ff4444;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.3s;
      `;
      logoutBtn.onmouseover = function() {
        this.style.background = '#cc0000';
      };
      logoutBtn.onmouseout = function() {
        this.style.background = '#ff4444';
      };
      logoutBtn.onclick = function() {
        window.location.href = '/docs/logout';
      };
      topbar.style.position = 'relative';
      topbar.appendChild(logoutBtn);
    }
  }, 500);
});
