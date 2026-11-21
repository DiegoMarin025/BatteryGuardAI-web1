FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV MPLCONFIGDIR=/tmp/mpl NUMBA_CACHE_DIR=/tmp/numba PORT=7860
EXPOSE 7860
CMD ["python", "server.py", "--host", "0.0.0.0", "--no-browser"]
