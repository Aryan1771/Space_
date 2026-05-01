import sys
from PyQt5.QtCore import QUrl
from PyQt5.QtWidgets import QApplication, QMainWindow, QStatusBar, QToolBar, QLineEdit, QAction
from PyQt5.QtGui import QIcon
from PyQt5.QtWebEngineWidgets import QWebEngineView

class Browser(QMainWindow):
    def __init__(self):
        super(Browser, self).__init__()

        # Create the search bar
        # Create the toolbar with the search bar
        toolbar = QToolBar()

        # Create the web view
        self.web_view = QWebEngineView()
        self.web_view.setUrl(QUrl('https://www.google.com/'))
        self.setCentralWidget(self.web_view)
        # Create the status bar
        status_bar = QStatusBar()
        self.setStatusBar(status_bar)

        # Create the actions for the toolbar and menu
        back_action = QAction(QIcon("icons/back.png"), "Back", self)
        back_action.triggered.connect(self.web_view.back)

        forward_action = QAction(QIcon("icons/forward.png"), "Forward", self)
        forward_action.triggered.connect(self.web_view.forward)

        reload_action = QAction(QIcon("icons/reload.png"), "Reload", self)
        reload_action.triggered.connect(self.web_view.reload)

        stop_action = QAction(QIcon("icons/stop.png"), "Stop", self)
        stop_action.triggered.connect(self.web_view.stop)
        
        home_action=QAction(QIcon("icons/home.png"), "Home", self)
        home_action.triggered.connect(self.navigate_home)
        self.url_bar=QLineEdit()
        self.url_bar.returnPressed.connect(self.nav_url)
        toolbar.addWidget(self.url_bar)
        self.web_view.urlChanged.connect(self.update_url)
        # Add the actions to the toolbar and menu
        toolbar.addAction(back_action)
        toolbar.addAction(forward_action)
        toolbar.addAction(reload_action)
        toolbar.addAction(stop_action)
        toolbar.addAction(home_action)
        self.showMaximized()
    def navigate_home(self):
        self.web_view.setUrl(QUrl('https://www.google.com/'))
    def nav_url(self):
        url = QUrl.fromUserInput(self.sender().text())
        self.web_view.load(url)
        self.web_view.setUrl(QUrl(url))
    def update_url(self,q):
        self.url_bar.setText(q.toString())
        # Set the window properties
        self.setWindowTitle("Web Browser")
        self.setWindowIcon(QIcon("icons/browser.png"))
        self.showMaximized()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    browser = Browser()
    browser.show()
    sys.exit(app.exec_())
