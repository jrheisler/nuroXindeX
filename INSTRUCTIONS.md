# How to run this project locally

Due to browser security restrictions, you cannot open the `index.html` file directly from your local file system. You need to serve the files from a local web server.

Here's how to do it using Python's built-in HTTP server:

1.  **Open a terminal or command prompt.**
2.  **Navigate to the root directory of this project.**
3.  **Run the following command:**

    ```bash
    python -m http.server
    ```

4.  **Open your web browser and go to the following address:**

    [http://localhost:8000](http://localhost:8000)

You should now be able to use the application without any CORS errors.
