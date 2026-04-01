# Use the official Nginx image as the base
FROM nginx:alpine

# Remove the default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy Bounce app files
COPY . /usr/share/nginx/html
# Copy shared modules
COPY ../shared /usr/share/nginx/html/shared

# Expose port 80
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]
